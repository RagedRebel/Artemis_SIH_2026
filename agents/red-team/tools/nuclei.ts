import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { NucleiParser } from '../parsers/nuclei-parser.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

export const nucleiScanTool = new FunctionTool({
  name: 'nuclei_scan',
  description: `Run a Nuclei template-based vulnerability scan against a target.

Provide host + port instead of a full URL — the tool auto-builds the correct
http:// or https:// URL based on port number and nmap service tags.

Template guidance:
  - 'cves/'          → all CVE templates (broad, recommended for initial scan)
  - 'exposures/'     → exposed sensitive files, configs, credentials
  - 'technologies/'  → detect tech stack (CMS, frameworks, versions)
  - 'misconfigs/'    → security misconfiguration checks
  - 'default-logins/'→ test common default credentials
  - 'takeovers/'     → subdomain takeover opportunities
  - 'network/'       → network-level checks (for non-HTTP services with HTTP admin panels)

Severity filter: use 'critical,high' for exploitation focus, omit for full coverage.`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port — used to auto-build http:// or https:// URL'),
    nmapTags: z.array(z.string()).optional().describe('nmap service tags, e.g. ["ssl", "http"]. Used for accurate URL scheme.'),
    templates: z.string().optional().describe("Template directory or specific template, e.g. 'cves/' or 'cves/2021/CVE-2021-41773.yaml'"),
    severity: z.string().optional().describe("Filter by severity, e.g. 'critical,high,medium'"),
    extraFlags: z.string().optional().describe('Additional nuclei flags'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ target, port, nmapTags, templates, severity, extraFlags, campaignId }) => {
    const start = Date.now()

    // Auto-build correct URL with proper scheme
    const targetUrl = buildTargetUrl(target, port, nmapTags ?? [])

    let command = `nuclei -u ${targetUrl} -jsonl -silent`

    // Always skip TLS verification for HTTPS targets in pentest environments
    if (targetUrl.startsWith('https://')) command += ' -no-verify'

    if (templates) command += ` -t ${templates}`
    if (severity) command += ` -severity ${severity}`
    if (extraFlags) command += ` ${extraFlags}`

    const result = await kesExec(command, 300)
    const findings = NucleiParser.parseJsonl(result.stdout)

    // Group by severity for quick summary
    const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
      const sev = f.info.severity ?? 'unknown'
      acc[sev] = (acc[sev] ?? 0) + 1
      return acc
    }, {})

    await logger.audit(
      'nuclei_scan',
      { targetUrl, templates, severity },
      { findings: findings.length, bySeverity },
      Date.now() - start,
      campaignId,
    )

    // rawOutput goes to audit log only — parsed findings returned to agent
    return {
      targetUrl,
      findings,
      totalFindings: findings.length,
      bySeverity,
      error: result.returncode !== 0 ? result.stderr : undefined,
    }
  },
})
