import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { GenericParser } from '../parsers/generic-parser.js'
import { createLogger } from '../../shared/logger.js'
import { resolvePortProtocol } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

export const gobusterScanTool = new FunctionTool({
  name: 'gobuster_scan',
  description: `Run Gobuster for directory and subdomain brute-forcing on a web target.

Protocol (HTTP vs HTTPS) is auto-detected from port + nmapTags — you do NOT need to
include the scheme in the url parameter. Provide host:port and let the tool build the
correct URL. If you provide a full URL with scheme, that scheme is used as-is.

Gobuster status code guide (check statusFilter to include):
  - 200: Found and accessible
  - 301/302: Redirect (follow with curl to see destination)
  - 403: Exists but forbidden — still worth noting, may be bypassable
  - 401: Authentication required — possible admin panel

Always include -x php,html,txt,bak,old,conf for thorough dir scans.`,
  parameters: z.object({
    target: z.string().describe('Target host (IP or hostname), e.g. "192.168.1.10"'),
    port: z.number().describe('Target port number — used to auto-detect HTTP vs HTTPS'),
    nmapTags: z.array(z.string()).optional().describe('nmap service tags for this port, e.g. ["ssl", "http"]. Used for accurate protocol detection.'),
    mode: z.enum(['dir', 'dns', 'vhost']).optional().describe('Gobuster mode (default: dir)'),
    wordlist: z.string().optional().describe('Path to wordlist file (default: /usr/share/wordlists/dirb/common.txt)'),
    extensions: z.string().optional().describe("File extensions to search, e.g. 'php,html,txt,bak,conf'"),
    statusFilter: z.string().optional().describe("Status codes to include, e.g. '200,301,302,403' (default: all non-404)"),
    extraFlags: z.string().optional().describe('Additional gobuster flags'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ target, port, nmapTags, mode, wordlist, extensions, statusFilter, extraFlags, campaignId }) => {
    const start = Date.now()
    const m = mode ?? 'dir'
    const wl = wordlist ?? '/usr/share/wordlists/dirb/common.txt'

    // Auto-detect protocol from port + nmap tags
    const proto = resolvePortProtocol(port, nmapTags ?? [])
    const effectiveScheme = ['http', 'https'].includes(proto.scheme) ? proto.scheme : 'http'
    const url = `${effectiveScheme}://${target}:${port}`

    let command = `gobuster ${m} -u ${url} -w ${wl} -q`

    if (extensions && m === 'dir') command += ` -x ${extensions}`
    if (statusFilter) command += ` -s ${statusFilter}`

    // Add -k (skip TLS cert) for HTTPS targets (self-signed certs are common in lab environments)
    if (proto.gobusterFlags.length > 0) command += ` ${proto.gobusterFlags.join(' ')}`

    if (extraFlags) command += ` ${extraFlags}`

    const result = await kesExec(command, 300)
    const parsed = GenericParser.summarize(result.stdout)

    // Parse discoveries with status codes for richer context
    const discoveries = result.stdout
      .split('\n')
      .filter(l => l.match(/Status:\s*\d{3}/) || l.includes('Found:'))
      .map(l => l.trim())
      .filter(Boolean)

    // Flag 403s separately — they exist but are access-controlled
    const forbidden = discoveries.filter(l => l.includes('Status: 403') || l.includes('(Status: 403)'))
    const accessible = discoveries.filter(l => !l.includes('Status: 403') && !l.includes('(Status: 403)'))

    await logger.audit(
      'gobuster_scan',
      { url, mode: m, proto: effectiveScheme },
      { total: discoveries.length, accessible: accessible.length, forbidden: forbidden.length },
      Date.now() - start,
      campaignId,
    )

    // rawOutput goes to audit log only — parsed summary returned to agent
    return {
      url,
      protocol: effectiveScheme,
      isSSL: proto.isSSL,
      discoveries,
      accessible,
      forbidden,
      ...parsed,
      error: result.returncode !== 0 ? result.stderr : undefined,
    }
  },
})
