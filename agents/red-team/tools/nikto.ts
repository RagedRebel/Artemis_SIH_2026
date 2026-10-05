import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { GenericParser } from '../parsers/generic-parser.js'
import { createLogger } from '../../shared/logger.js'
import { resolvePortProtocol } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

export const niktoScanTool = new FunctionTool({
  name: 'nikto_scan',
  description: `Run Nikto web server vulnerability scanner against a target.

SSL is auto-detected from port + nmapTags — the -ssl flag is added automatically
for HTTPS ports (443, 8443, etc.) and omitted for plain HTTP ports (80, 8080, etc.).
Do NOT manually pass -ssl in extraFlags unless you need to override auto-detection.

Nikto finds:
  - Server misconfigurations (directory listing, dangerous HTTP methods)
  - Outdated software (headers reveal server version)
  - Default credentials and known vulnerable paths
  - Missing security headers (X-Frame-Options, CSP, HSTS)
  - Known OSVDB and CVE-referenced vulnerabilities`,
  parameters: z.object({
    target: z.string().describe('Target host IP or hostname'),
    port: z.number().describe('Target port — used to auto-detect SSL/TLS'),
    nmapTags: z.array(z.string()).optional().describe('nmap service tags for this port, e.g. ["ssl", "http"]'),
    tuning: z.string().optional().describe('Nikto tuning options (e.g. "1234" for specific test categories)'),
    extraFlags: z.string().optional().describe('Additional nikto flags (do NOT include -ssl — it is auto-set)'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ target, port, nmapTags, tuning, extraFlags, campaignId }) => {
    const start = Date.now()

    // Auto-detect SSL from port + nmap tags
    const proto = resolvePortProtocol(port, nmapTags ?? [])

    let command = `nikto -h ${target} -p ${port} -Format txt`

    // Add -ssl flag for HTTPS targets
    if (proto.niktoFlags.length > 0) command += ` ${proto.niktoFlags.join(' ')}`

    if (tuning) command += ` -Tuning ${tuning}`
    if (extraFlags) command += ` ${extraFlags}`

    const result = await kesExec(command, 300)
    const parsed = GenericParser.summarize(result.stdout)

    // Extract OSVDB references and + findings (nikto format)
    const osvdbRefs = result.stdout
      .split('\n')
      .filter(l => l.includes('+ OSVDB-') || l.includes('+ CVE-'))
      .map(l => l.trim())

    await logger.audit(
      'nikto_scan',
      { target, port, isSSL: proto.isSSL },
      { findingsCount: parsed.keyFindings.length, osvdbRefs: osvdbRefs.length },
      Date.now() - start,
      campaignId,
    )

    // rawOutput goes to audit log only — parsed summary returned to agent
    return {
      target: `${proto.scheme}://${target}:${port}`,
      isSSL: proto.isSSL,
      osvdbRefs,
      ...parsed,
      error: result.returncode !== 0 ? result.stderr : undefined,
    }
  },
})
