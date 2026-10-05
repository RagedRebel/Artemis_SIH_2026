import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { NmapParser } from '../parsers/nmap-parser.js'
import type { NetworkHost } from '../../shared/types.js'
import { createLogger } from '../../shared/logger.js'
import { db } from '../../shared/db-client.js'

const logger = createLogger('red_team_agent')

const PROFILES: Record<string, string> = {
  discovery: '-sn --min-rate=1000',
  quick: '-sV -sC -T4 --top-ports 1000',
  full: '-sV -sC -p- -T4 --min-rate=2000',
  stealth: '-sS -sV -T2 -p- --min-rate=500',
  udp: '-sU --top-ports 200 -T4',
  vuln: '-sV --script=vuln -T4',
}

export const nmapScanTool = new FunctionTool({
  name: 'nmap_scan',
  description: 'Run an nmap scan against one or more targets. Returns parsed host/port/service objects.',
  parameters: z.object({
    target: z.string().describe('IP, hostname, or CIDR range to scan'),
    profile: z.enum(['discovery', 'quick', 'full', 'stealth', 'udp', 'vuln']).optional().describe('Scan profile (default: quick)'),
    extraFlags: z.string().optional().describe('Additional nmap flags appended verbatim'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt (e.g. "7cb68597-9918-47ca-832b-3091455defde"). Copy it exactly — never invent one.'),
  }),
  execute: async ({ target, profile, extraFlags, campaignId }): Promise<{ hostSummaries: NetworkHost[]; textOverview?: string; error?: string }> => {
    const start = Date.now()
    const flags = PROFILES[profile ?? 'quick']
    const extra = extraFlags ?? ''
    const command = `nmap ${flags} ${extra} -oX - ${target}`

    const result = await kesExec(command, 300)

    if (result.returncode !== 0 && !result.stdout) {
      await logger.audit('nmap_scan', { target, profile, extraFlags }, { hostSummaries: [], error: result.stderr }, Date.now() - start, campaignId)
      return { hostSummaries: [], error: result.stderr }
    }

    const hosts = NmapParser.parseXml(result.stdout)

    for (const host of hosts) {
      try {
        await db.query(`
          INSERT INTO network_hosts (ip, hostname, os, open_ports)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (ip) DO UPDATE SET
            hostname = EXCLUDED.hostname,
            os = EXCLUDED.os,
            open_ports = EXCLUDED.open_ports
        `, [host.ip, host.hostname ?? null, host.os ?? null, JSON.stringify(host.openPorts)])
      } catch (err) {
        logger.error('Failed to save host to db', { ip: host.ip, error: String(err) })
      }
    }

    const textOverview = `Nmap scan completed successfully. Found ${hosts.length} live host(s).`
    // rawOutput (XML) goes to audit log only — not returned to agent to avoid context bloat
    await logger.audit('nmap_scan', { target, profile, extraFlags }, { hostSummaries: hosts, textOverview, rawOutput: result.stdout }, Date.now() - start, campaignId)
    return { hostSummaries: hosts, textOverview }
  },
})
