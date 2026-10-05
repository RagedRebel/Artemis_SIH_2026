/** Human-readable audit input summaries (no raw JSON for operators). */

export type AuditInputRow = { label: string; value: string }

const MAX_PARAGRAPH = 1200
const MAX_LINE = 320

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

function parseObject(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as Record<string, unknown>
    } catch {
      return { note: input }
    }
  }
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>
  return null
}

function labelizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatPrimitive(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string') return truncate(v, MAX_LINE)
  return truncate(JSON.stringify(v), MAX_LINE)
}

function formatArray(arr: unknown[]): string {
  if (arr.length === 0) return 'None'
  if (arr.every(x => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
    return arr.map(String).join(', ')
  }
  return `${arr.length} item${arr.length === 1 ? '' : 's'}`
}

function push(rows: AuditInputRow[], label: string, value: unknown) {
  if (value === undefined) return
  const s =
    typeof value === 'string'
      ? truncate(value, value.length > 400 ? MAX_PARAGRAPH : MAX_LINE)
      : Array.isArray(value)
        ? formatArray(value)
        : typeof value === 'object' && value !== null
          ? truncate(JSON.stringify(value), MAX_LINE)
          : formatPrimitive(value)
  if (s === '—' && value !== null && value !== '') return
  rows.push({ label, value: s })
}

function byTool(toolName: string, o: Record<string, unknown>): AuditInputRow[] {
  const rows: AuditInputRow[] = []

  switch (toolName) {
    case 'report_finding':
      push(rows, 'Finding title', o.title)
      push(rows, 'Affected host', o.affectedHost)
      push(rows, 'Severity', o.severity)
      push(rows, 'CVSS score', o.cvssScore)
      push(rows, 'Campaign', o.campaignId)
      return rows

    case 'create_campaign':
      push(rows, 'Campaign name', o.name)
      push(rows, 'Target scope', Array.isArray(o.targetScope) ? formatArray(o.targetScope as unknown[]) : o.targetScope)
      push(rows, 'Max risk level', o.maxRiskLevel)
      return rows

    case 'update_campaign':
      push(rows, 'Campaign', o.campaignId)
      push(rows, 'New status', o.status)
      push(rows, 'Message', o.message)
      return rows

    case 'close_campaign':
      push(rows, 'Campaign', o.campaignId)
      if (typeof o.summary === 'string') {
        rows.push({ label: 'Summary', value: truncate(o.summary, MAX_PARAGRAPH) })
      }
      return rows

    case 'nmap_scan':
      push(rows, 'Target', o.target)
      push(rows, 'Scan profile', o.profile)
      if (o.extraFlags) push(rows, 'Extra flags', o.extraFlags)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'sqlmap_scan':
      push(rows, 'Target URL', o.url)
      if (o.level != null) push(rows, 'Level', o.level)
      if (o.risk != null) push(rows, 'Risk', o.risk)
      if (o.technique) push(rows, 'Techniques', o.technique)
      if (o.extraFlags) push(rows, 'Extra flags', o.extraFlags)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'gobuster_scan':
      // New schema: target + port (url may be present in older audit rows)
      if (o.target) push(rows, 'Target', o.target)
      if (o.port) push(rows, 'Port', o.port)
      if (o.url && !o.target) push(rows, 'Target URL', o.url)
      push(rows, 'Mode', o.mode)
      if (o.wordlist) push(rows, 'Wordlist', o.wordlist)
      if (o.extensions) push(rows, 'Extensions', o.extensions)
      if (o.extraFlags) push(rows, 'Extra flags', o.extraFlags)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'nuclei_scan':
      push(rows, 'Target', o.target)
      if (o.port) push(rows, 'Port', o.port)
      if (o.templates) push(rows, 'Templates', o.templates)
      if (o.severity) push(rows, 'Severity filter', o.severity)
      if (o.extraFlags) push(rows, 'Extra flags', o.extraFlags)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'nikto_scan':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      if (o.tuning) push(rows, 'Tuning', o.tuning)
      if (o.extraFlags) push(rows, 'Extra flags', o.extraFlags)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'web_tech_detect':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'lfi_test':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      push(rows, 'Path', o.path)
      push(rows, 'Parameter', o.parameter)
      if (o.method) push(rows, 'Method', o.method)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'xss_scan':
      push(rows, 'URL', o.url)
      if (o.method) push(rows, 'Method', o.method)
      if (o.postData) push(rows, 'POST data', o.postData)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'auth_test':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      push(rows, 'Login path', o.loginPath)
      if (o.usernameField) push(rows, 'Username field', o.usernameField)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'cors_test':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      if (Array.isArray(o.paths)) push(rows, 'Paths', o.paths)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'ssrf_test':
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      push(rows, 'Path', o.path)
      push(rows, 'Parameter', o.parameter)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'ad_enum':
      push(rows, 'DC IP', o.dcIp)
      if (o.domain) push(rows, 'Domain', o.domain)
      if (o.username) push(rows, 'Username', o.username)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'kerberoast':
      push(rows, 'DC IP', o.dcIp)
      push(rows, 'Domain', o.domain)
      push(rows, 'Username', o.username)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'asreproast':
      push(rows, 'DC IP', o.dcIp)
      push(rows, 'Domain', o.domain)
      if (Array.isArray(o.users)) push(rows, 'Users tested', o.users.length)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'pass_the_hash':
      push(rows, 'Target IP', o.targetIp)
      push(rows, 'Username', o.username)
      push(rows, 'Method', o.method)
      if (o.domain) push(rows, 'Domain', o.domain)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'password_crack':
      push(rows, 'Hash file', o.hashFile)
      push(rows, 'Hash type', o.hashType)
      if (o.wordlist) push(rows, 'Wordlist', o.wordlist)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'privesc_enum':
      push(rows, 'Target OS', o.targetOS)
      push(rows, 'Shell ID', o.msfShellId)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'cred_harvest':
      push(rows, 'Target OS', o.targetOS)
      push(rows, 'Shell ID', o.msfShellId)
      if (o.webRoot) push(rows, 'Web root', o.webRoot)
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'run_exploit':
      push(rows, 'Metasploit module', o.module)
      push(rows, 'Target', o.target)
      push(rows, 'Port', o.port)
      if (o.payload) push(rows, 'Payload', o.payload)
      if (o.options && typeof o.options === 'object' && o.options !== null) {
        const entries = Object.entries(o.options as Record<string, string>)
        if (entries.length) {
          rows.push({
            label: 'Module options',
            value: entries.map(([k, v]) => `${k}=${v}`).join(', '),
          })
        }
      }
      if (o.campaignId) push(rows, 'Campaign', o.campaignId)
      return rows

    case 'get_wazuh_alerts':
      push(rows, 'Minimum level', o.level)
      push(rows, 'Tag filter', o.tag)
      push(rows, 'Row limit', o.limit)
      return rows

    case 'suggest_detection_rule':
      push(rows, 'MITRE technique', o.mitreTechniqueId)
      if (o.attackPattern) rows.push({ label: 'Attack pattern', value: truncate(String(o.attackPattern), MAX_PARAGRAPH) })
      push(rows, 'Rule severity (level)', o.severity)
      if (o.logPattern) rows.push({ label: 'Log pattern', value: truncate(String(o.logPattern), MAX_LINE) })
      if (o.rationale) rows.push({ label: 'Rationale', value: truncate(String(o.rationale), MAX_PARAGRAPH) })
      return rows

    case 'search_github_poc':
    case 'search_exploitdb':
      push(rows, 'CVE', o.cveId)
      return rows

    case 'fetch_recent_cves':
      push(rows, 'Days lookback', o.days)
      push(rows, 'Minimum CVSS', o.minCvss)
      push(rows, 'Result limit', o.limit)
      return rows

    case 'assess_applicability':
      push(rows, 'CVE', o.cveId)
      push(rows, 'Products considered', o.productCount)
      return rows

    case 'queue_exploit_task':
      push(rows, 'CVE', o.cveId)
      push(rows, 'CVSS score', o.cvssScore)
      if (Array.isArray(o.applicableHosts)) {
        const hosts = o.applicableHosts as unknown[]
        rows.push({
          label: 'Applicable hosts',
          value:
            hosts.length === 0
              ? 'None'
              : hosts.length <= 8
                ? hosts.map(String).join(', ')
                : `${hosts.length} hosts: ${hosts
                    .slice(0, 5)
                    .map(String)
                    .join(', ')}…`,
        })
      }
      return rows

    case 'correlate_events':
      push(rows, 'Alerts analyzed', o.alertCount)
      push(rows, 'Time window (minutes)', o.windowMinutes)
      return rows

    case 'create_incident_ticket':
      push(rows, 'Title', o.title)
      push(rows, 'Severity', o.severity)
      push(rows, 'Alerts referenced', o.alertCount)
      return rows

    case 'trigger_active_response':
      push(rows, 'Wazuh agent', o.agentId)
      push(rows, 'Command', o.command)
      if (o.parameters && typeof o.parameters === 'object' && o.parameters !== null) {
        const p = o.parameters as Record<string, unknown>
        const parts = Object.entries(p).map(([k, v]) => `${labelizeKey(k)}: ${formatPrimitive(v)}`)
        if (parts.length) rows.push({ label: 'Parameters', value: parts.join(' · ') })
      }
      return rows

    case 'request_approval':
      push(rows, 'Action', o.action)
      push(rows, 'Request ID', o.approvalId)
      return rows

    default:
      return []
  }
}

function genericFallback(o: Record<string, unknown>): AuditInputRow[] {
  const rows: AuditInputRow[] = []
  const skip = new Set(['evidence', 'context'])

  for (const [key, value] of Object.entries(o)) {
    if (skip.has(key)) continue
    if (value === undefined) continue

    const label = labelizeKey(key)

    if (value === null) {
      rows.push({ label, value: '—' })
      continue
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      push(rows, label, value)
      continue
    }

    if (Array.isArray(value)) {
      push(rows, label, value)
      continue
    }

    if (typeof value === 'object') {
      const nested = value as Record<string, unknown>
      const keys = Object.keys(nested)
      if (keys.length === 0) {
        rows.push({ label, value: '—' })
      } else if (keys.length <= 6) {
        const brief = keys
          .slice(0, 8)
          .map(k => `${labelizeKey(k)}: ${formatPrimitive(nested[k])}`)
          .join(' · ')
        rows.push({ label, value: truncate(brief, MAX_PARAGRAPH) })
      } else {
        rows.push({ label, value: `${keys.length} fields` })
      }
    }
  }

  return rows
}

export function getAuditInputSummary(toolName: string, input: unknown): AuditInputRow[] {
  const o = parseObject(input)
  if (!o || Object.keys(o).length === 0) {
    return [{ label: 'Details', value: 'No input parameters were stored for this entry.' }]
  }

  const specific = byTool(toolName, o)
  if (specific.length > 0) return specific

  return genericFallback(o)
}
