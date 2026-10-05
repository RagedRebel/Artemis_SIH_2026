import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

export interface TechStack {
  cms?: string           // wordpress, drupal, joomla, etc.
  framework?: string     // laravel, django, rails, spring, etc.
  language?: string      // php, python, ruby, java, etc.
  server?: string        // apache, nginx, iis, tomcat, etc.
  waf?: string           // cloudflare, akamai, mod_security, etc.
  tlsVersion?: string    // TLS 1.0/1.1/1.2/1.3
  headers: Record<string, string>
  raw: string
}

/**
 * Detect web technology stack before choosing attack tools.
 * Gates downstream tool selection — run this BEFORE wpscan, droopescan, etc.
 *
 * Decision guide based on output:
 *   cms = wordpress  → run wpscan_analyze
 *   cms = drupal     → run nuclei with drupal templates + searchsploit drupal
 *   cms = joomla     → searchsploit joomla, nuclei joomla templates
 *   server = tomcat  → check /manager endpoint, try default creds, nuclei tomcat
 *   server = iis     → searchsploit IIS version, nuclei iis
 *   waf detected     → adjust payloads (WAF bypass techniques may be needed)
 *   tlsVersion = 1.0 or 1.1 → report as vulnerability (deprecated TLS)
 */
export const webTechDetectTool = new FunctionTool({
  name: 'web_tech_detect',
  description: `Detect the technology stack of a web application (CMS, framework, server, WAF).
ALWAYS run this before CMS-specific tools (wpscan, droopescan) to confirm what's running.
Also reveals deprecated TLS versions and security headers status.`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional().describe('nmap service tags for protocol detection'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ target, port, nmapTags, campaignId }) => {
    const start = Date.now()
    const url = buildTargetUrl(target, port, nmapTags ?? [])

    const whatwebResult = await kesExec(`whatweb -a 3 --no-errors --color=never ${url}`, 60)

    // Fetch headers manually for reliable extraction
    const curlResult = await kesExec(
      `curl -s -I --max-time 10 -k ${url}`,
      20,
    )

    // Run sslscan for HTTPS targets to detect deprecated TLS versions
    let sslResult = { stdout: '', returncode: 0 }
    if (url.startsWith('https://')) {
      sslResult = await kesExec(`sslscan --no-colour ${target}:${port}`, 30)
    }

    const techStack = parseTechStack(stripAnsi(whatwebResult.stdout), curlResult.stdout, sslResult.stdout)

    // Generate tool recommendations based on detected stack
    const recommendations = buildRecommendations(techStack)

    await logger.audit(
      'web_tech_detect',
      { url },
      { 
        cms: techStack.cms, 
        server: techStack.server, 
        waf: techStack.waf,
        rawWhatweb: whatwebResult.stdout.slice(0, 1000) 
      },
      Date.now() - start,
      campaignId,
    )

    const detectedTech = parseWhatWebTags(stripAnsi(whatwebResult.stdout))

    return {
      url,
      techStack,
      detectedTech,
      recommendations,
      rawWhatweb: stripAnsi(whatwebResult.stdout),
      rawHeaders: curlResult.stdout,
    }
  },
})

function parseTechStack(whatweb: string, headers: string, ssl: string): TechStack {
  const lower = whatweb.toLowerCase()
  const headersLower = headers.toLowerCase()

  // Parse HTTP headers into key-value
  const parsedHeaders: Record<string, string> = {}
  for (const line of headers.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim().toLowerCase()
      const val = line.slice(idx + 1).trim()
      parsedHeaders[key] = val
    }
  }

  // CMS detection
  let cms: string | undefined
  if (lower.includes('wordpress') || lower.includes('/wp-content/') || lower.includes('/wp-includes/')) cms = 'wordpress'
  else if (lower.includes('drupal')) cms = 'drupal'
  else if (lower.includes('joomla')) cms = 'joomla'
  else if (lower.includes('magento')) cms = 'magento'
  else if (lower.includes('shopify')) cms = 'shopify'

  // Server detection
  let server: string | undefined
  const serverHeader = parsedHeaders['server'] ?? ''
  if (serverHeader.toLowerCase().includes('apache') || lower.includes('apache')) server = `apache (${serverHeader})`
  else if (serverHeader.toLowerCase().includes('nginx') || lower.includes('nginx')) server = `nginx (${serverHeader})`
  else if (serverHeader.toLowerCase().includes('iis') || lower.includes('iis')) server = `iis (${serverHeader})`
  else if (lower.includes('tomcat') || headersLower.includes('tomcat')) server = 'tomcat'
  else if (serverHeader) server = serverHeader

  // Framework/language detection
  let framework: string | undefined
  let language: string | undefined
  const poweredBy = (parsedHeaders['x-powered-by'] ?? '').toLowerCase()
  if (lower.includes('laravel') || poweredBy.includes('laravel')) {
    framework = 'laravel'; language = 'php'
  } else if (lower.includes('django') || lower.includes('csrftoken')) {
    framework = 'django'; language = 'python'
  } else if (lower.includes('flask') || poweredBy.includes('flask')) {
    framework = 'flask'; language = 'python'
  } else if (lower.includes('rails') || parsedHeaders['x-runtime']) {
    framework = 'rails'; language = 'ruby'
  } else if (lower.includes('spring') || lower.includes('java')) {
    framework = 'spring'; language = 'java'
  } else if (lower.includes('next.js') || lower.includes('nextjs') || parsedHeaders['x-nextjs-cache'] || parsedHeaders['x-nextjs-matched-path']) {
    framework = 'next.js'; language = 'javascript'
  } else if (lower.includes('nuxt')) {
    framework = 'nuxt'; language = 'javascript'
  } else if (lower.includes('express') || poweredBy.includes('express')) {
    framework = 'express'; language = 'javascript'
  } else if (lower.includes('asp.net') || parsedHeaders['x-aspnet-version']) {
    framework = 'asp.net'; language = 'c#'
  } else if (poweredBy.includes('php') || lower.includes('php')) {
    language = 'php'
  } else if (lower.includes('python') || poweredBy.includes('python')) {
    language = 'python'
  } else if (lower.includes('node') || poweredBy.includes('node')) {
    language = 'javascript'
  } else if (lower.includes('ruby') || poweredBy.includes('ruby')) {
    language = 'ruby'
  }

  // WAF detection
  let waf: string | undefined
  if (lower.includes('cloudflare') || parsedHeaders['cf-ray']) waf = 'cloudflare'
  else if (lower.includes('akamai') || parsedHeaders['x-akamai-request-id']) waf = 'akamai'
  else if (parsedHeaders['x-sucuri-id']) waf = 'sucuri'
  else if (lower.includes('mod_security') || lower.includes('modsec')) waf = 'mod_security'

  // TLS version (from sslscan — only flag protocols that are enabled/accepted)
  const sslLower = ssl.toLowerCase()
  const tlsEnabled = (proto: string) =>
    new RegExp(`${proto}\\s+(enabled|accepted)`, 'i').test(ssl) ||
    sslLower.includes(`${proto.toLowerCase()}  enabled`)

  const tlsVersions: string[] = []
  if (tlsEnabled('TLSv1.0')) tlsVersions.push('TLS 1.0 (deprecated)')
  if (tlsEnabled('TLSv1.1')) tlsVersions.push('TLS 1.1 (deprecated)')
  if (tlsEnabled('TLSv1.2')) tlsVersions.push('TLS 1.2')
  if (tlsEnabled('TLSv1.3')) tlsVersions.push('TLS 1.3')
  const tlsVersion = tlsVersions.length > 0 ? tlsVersions.join(', ') : undefined

  return {
    cms,
    framework,
    language,
    server,
    waf,
    tlsVersion,
    headers: parsedHeaders,
    raw: whatweb,
  }
}

function buildRecommendations(stack: TechStack): string[] {
  const rec: string[] = []

  if (stack.cms === 'wordpress') {
    rec.push('Run wpscan_analyze to enumerate WordPress plugins, themes, and users.')
    rec.push('Run nuclei_scan with templates: "vulnerabilities/wordpress/"')
  }
  if (stack.cms === 'drupal') {
    rec.push('Run searchsploit("drupal") and check for Drupalgeddon2 (SA-CORE-2018-002, CVE-2018-7600).')
    rec.push('Run nuclei_scan with templates: "vulnerabilities/drupal/"')
  }
  if (stack.cms === 'joomla') {
    rec.push('Run nuclei_scan with templates: "vulnerabilities/joomla/"')
    rec.push('Check /administrator for default credentials.')
  }
  if (stack.server?.includes('tomcat')) {
    rec.push('Check /manager/html for Tomcat Manager (default creds: tomcat:tomcat, admin:admin).')
    rec.push('Run nuclei_scan with templates: "vulnerabilities/apache/tomcat/"')
    rec.push('Run msf_search("type:exploit tomcat") for RCE via manager WAR upload.')
  }
  if (stack.server?.includes('iis')) {
    rec.push('Run searchsploit("IIS") for version-specific vulnerabilities.')
    rec.push('Check for WebDAV: run_command("curl -X OPTIONS http://target/") and look for PROPFIND, PUT methods.')
  }
  if (stack.language === 'php') {
    rec.push('Test for PHP-specific vulnerabilities: LFI via ?page=, type juggling in login forms.')
    rec.push('Run nuclei_scan with templates: "vulnerabilities/php/"')
  }
  if (stack.waf) {
    rec.push(`WAF detected (${stack.waf}). Standard payloads may be blocked. Use encoded/obfuscated payloads.`)
    rec.push('Consider using sqlmap --tamper flags or nuclei with WAF-bypass templates.')
  }
  if (stack.tlsVersion?.includes('deprecated')) {
    rec.push(`FINDING: ${stack.tlsVersion} is enabled — report as Medium vulnerability (deprecated protocol).`)
  }
  if (!stack.headers['x-frame-options'] && !stack.headers['content-security-policy']) {
    rec.push('Missing security headers (X-Frame-Options, CSP) — report as Low finding.')
  }
  if (!stack.headers['strict-transport-security'] && stack.headers['x-powered-by']) {
    rec.push('Missing HSTS header and X-Powered-By is exposed — report as Low findings.')
  }

  return rec
}

export type WhatWebTag = { name: string; values: string[] }

function splitWhatWebParts(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[') depth++
    else if (s[i] === ']') depth--
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = s.slice(start).trim()
  if (last) parts.push(last)
  return parts
}

function parseWhatWebTags(raw: string): WhatWebTag[] {
  const lines = raw.split('\n').filter(l => l.trim())
  const tags: WhatWebTag[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    let afterUrl = line.replace(/^https?:\/\/\S+\s*/, '')
    afterUrl = afterUrl.replace(/^\[\d{3}\s[^\]]*\]\s*/, '')

    const parts = splitWhatWebParts(afterUrl)

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const bracketIdx = trimmed.indexOf('[')
      if (bracketIdx === -1) {
        const name = trimmed
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase())
          tags.push({ name, values: [] })
        }
        continue
      }

      const name = trimmed.slice(0, bracketIdx).trim()
      if (!name) continue

      const values: string[] = []
      const re = /\[([^\]]*)\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(trimmed)) !== null) {
        if (m[1]) values.push(m[1])
      }

      const key = name.toLowerCase()
      if (seen.has(key)) {
        const existing = tags.find(t => t.name.toLowerCase() === key)
        if (existing) {
          for (const v of values) {
            if (!existing.values.includes(v)) existing.values.push(v)
          }
        }
      } else {
        seen.add(key)
        tags.push({ name, values })
      }
    }
  }

  return tags
}
