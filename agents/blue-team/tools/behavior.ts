import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { createLogger } from '../../shared/logger.js'
import { syscollectorProcesses, syscollectorPorts } from './wazuh-syscollector.js'

const logger = createLogger('blue_team_agent')

interface ParentChildPair {
  parent: string
  child: string
}

interface ProcessSetBaseline {
  processes: string[]
  parent_child_pairs: ParentChildPair[]
  cmd_entropies?: Record<string, { avg: number; max: number; count: number }>
}

function calculateEntropy(str: string): number {
  if (!str || str.length === 0) return 0
  const chars = new Map<string, number>()
  for (const c of str) chars.set(c, (chars.get(c) || 0) + 1)
  return [...chars.values()].reduce((sum, count) => {
    const p = count / str.length
    return sum - p * Math.log2(p)
  }, 0)
}

interface LoginHistogram {
  hour_counts: Record<string, number>
  total_samples: number
}

export const buildAgentBaselineTool = new FunctionTool({
  name: 'build_agent_baseline',
  description: `Compute statistical baselines for a Wazuh agent over a recent window. Stores process set, login-hour histogram, parent->child process pairs, file-write rate, and network destination diversity.
Run this for each active agent on a daily cycle (or once after onboarding) so analyze_agent_behavior has something to compare against.`,
  parameters: z.object({
    agentId: z.string().describe('Wazuh agent_id'),
    windowDays: z.number().optional().describe('Lookback window for SIEM-derived metrics (default 7)'),
  }),
  execute: async ({ agentId, windowDays }) => {
    const start = Date.now()
    const days = windowDays ?? 7
    const windowStart = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
    const windowEnd = new Date().toISOString()

    const procRows = await syscollectorProcesses(agentId, 200)
    const procSet = new Set<string>()
    const pairs = new Map<string, ParentChildPair>()
    for (const p of procRows) {
      const proc = p as { name?: string; ppid?: number; pid?: number }
      if (proc.name) procSet.add(proc.name)
    }
    const parentMap = new Map<number, string>()
    for (const p of procRows) {
      const proc = p as { name?: string; pid?: number }
      if (proc.pid && proc.name) parentMap.set(proc.pid, proc.name)
    }
    const cmdEntropies = new Map<string, number[]>()
    for (const p of procRows) {
      const proc = p as { name?: string; ppid?: number; cmd?: string }
      const parent = proc.ppid != null ? parentMap.get(proc.ppid) : undefined
      if (parent && proc.name) {
        const key = `${parent}->${proc.name}`
        pairs.set(key, { parent, child: proc.name })
      }
      if (proc.name && proc.cmd) {
        const entArr = cmdEntropies.get(proc.name) ?? []
        entArr.push(calculateEntropy(proc.cmd))
        cmdEntropies.set(proc.name, entArr)
      }
    }

    const entropyMap: Record<string, { avg: number; max: number; count: number }> = {}
    for (const [name, vals] of cmdEntropies.entries()) {
      const sum = vals.reduce((a, b) => a + b, 0)
      entropyMap[name] = { avg: sum / vals.length, max: Math.max(...vals), count: vals.length }
    }

    const processSet: ProcessSetBaseline = {
      processes: [...procSet],
      parent_child_pairs: [...pairs.values()],
      cmd_entropies: entropyMap,
    }

    const loginRows = await db.query<{ hour: string; count: string }>(
      `SELECT EXTRACT(HOUR FROM timestamp)::TEXT AS hour, COUNT(*)::TEXT AS count
         FROM siem_alerts
        WHERE agent_id = $1
          AND timestamp >= $2
          AND (rule_description ILIKE '%login%' OR rule_description ILIKE '%authentication%' OR rule_description ILIKE '%logged in%')
        GROUP BY 1`,
      [agentId, windowStart],
    )
    const histogram: LoginHistogram = { hour_counts: {}, total_samples: 0 }
    for (const r of loginRows.rows) {
      const c = parseInt(r.count, 10)
      histogram.hour_counts[r.hour] = c
      histogram.total_samples += c
    }

    const ubaRows = await db.query<{ username: string; ips: string }>(
      `SELECT raw_log->>'user' AS username, string_agg(DISTINCT src_ip::text, ',') AS ips
         FROM siem_alerts
        WHERE agent_id = $1
          AND timestamp >= $2
          AND (rule_description ILIKE '%login%' OR rule_description ILIKE '%authentication%')
          AND raw_log->>'user' IS NOT NULL
        GROUP BY 1`,
      [agentId, windowStart],
    )
    const userIps: Record<string, string[]> = {}
    for (const r of ubaRows.rows) if (r.username) userIps[r.username] = r.ips.split(',')

    const netRows = await db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT dst_ip)::TEXT AS count
         FROM siem_alerts
        WHERE agent_id = $1
          AND timestamp >= $2
          AND dst_ip IS NOT NULL`,
      [agentId, windowStart],
    )
    const netDiversity = parseInt(netRows.rows[0]?.count ?? '0', 10)

    const internalSmbRows = await db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT dst_ip)::TEXT AS count
         FROM siem_alerts
        WHERE agent_id = $1
          AND timestamp >= $2
          AND dst_ip IS NOT NULL
          AND dst_port IN (135, 445)`,
      [agentId, windowStart],
    )
    const smbPeers = parseInt(internalSmbRows.rows[0]?.count ?? '0', 10)

    const fimRows = await db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
         FROM siem_alerts
        WHERE agent_id = $1
          AND timestamp >= $2
          AND (rule_description ILIKE '%integrity%' OR rule_description ILIKE '%modified%' OR rule_description ILIKE '%file%')`,
      [agentId, windowStart],
    )
    const fimWrites = parseInt(fimRows.rows[0]?.count ?? '0', 10)
    const fimRate = fimWrites / Math.max(days, 1)

    const samples = procRows.length

    const upserts: Array<{ metric: string; value: unknown; samples: number }> = [
      { metric: 'process_set', value: processSet, samples },
      { metric: 'login_hour_distribution', value: histogram, samples: histogram.total_samples },
      { metric: 'user_ip_baseline', value: { user_ips: userIps }, samples: Object.keys(userIps).length },
      { metric: 'network_dest_diversity', value: { unique_destinations: netDiversity, smb_peers: smbPeers, window_days: days }, samples: netDiversity },
      { metric: 'file_write_rate', value: { events_per_day: fimRate, window_days: days }, samples: fimWrites },
      { metric: 'parent_child_pairs', value: { pairs: processSet.parent_child_pairs }, samples: processSet.parent_child_pairs.length },
    ]

    for (const u of upserts) {
      await db.query(
        `INSERT INTO agent_baselines (agent_id, metric_name, baseline_value, window_start, window_end, sample_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (agent_id, metric_name)
         DO UPDATE SET baseline_value = EXCLUDED.baseline_value,
                       window_start  = EXCLUDED.window_start,
                       window_end    = EXCLUDED.window_end,
                       sample_count  = EXCLUDED.sample_count,
                       updated_at    = NOW()`,
        [agentId, u.metric, JSON.stringify(u.value), windowStart, windowEnd, u.samples],
      )
    }

    await logger.audit('build_agent_baseline', { agentId, windowDays: days }, { metricsWritten: upserts.length }, Date.now() - start)
    return {
      agentId,
      windowDays: days,
      metrics: upserts.map(u => u.metric),
      summary: {
        processCount: processSet.processes.length,
        parentChildPairs: processSet.parent_child_pairs.length,
        loginSamples: histogram.total_samples,
        networkDestinations: netDiversity,
        fileWritesPerDay: fimRate,
      },
    }
  },
})

export const analyzeAgentBehaviorTool = new FunctionTool({
  name: 'analyze_agent_behavior',
  description: `Compare an agent's recent activity against its baseline. Emits behavioral_anomalies rows for: unseen processes, unseen parent->child pairs, off-hours logins, file-write spikes, network destination explosion.
Returns the anomalies for inclusion in incident verification evidence.`,
  parameters: z.object({
    agentId: z.string(),
    lookbackHours: z.number().optional().describe('How far back to look (default 1)'),
  }),
  execute: async ({ agentId, lookbackHours }) => {
    const start = Date.now()
    const hours = lookbackHours ?? 1
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()

    const baselines = await db.query<{ metric_name: string; baseline_value: any }>(
      `SELECT metric_name, baseline_value FROM agent_baselines WHERE agent_id = $1`,
      [agentId],
    )
    if (baselines.rows.length === 0) {
      return { agentId, anomalies: [], note: 'No baseline exists. Call build_agent_baseline first.' }
    }
    const baselineMap = new Map<string, any>()
    for (const b of baselines.rows) baselineMap.set(b.metric_name, b.baseline_value)

    const procs = await syscollectorProcesses(agentId, 200)
    const ports = await syscollectorPorts(agentId, 100)

    const anomalies: Array<{
      anomaly_type: string
      severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
      evidence: Record<string, unknown>
      baseline_ref: Record<string, unknown>
    }> = []

    const processBaseline = baselineMap.get('process_set') as ProcessSetBaseline | undefined
    if (processBaseline) {
      const baselineProcs = new Set(processBaseline.processes)
      const unseen: string[] = []
      const baselinePairs = new Set(processBaseline.parent_child_pairs.map(p => `${p.parent}->${p.child}`))
      const parentMap = new Map<number, string>()
      for (const p of procs) {
        const proc = p as { name?: string; pid?: number }
        if (proc.pid && proc.name) parentMap.set(proc.pid, proc.name)
      }
      const newPairs: string[] = []
      for (const p of procs) {
        const proc = p as { name?: string; ppid?: number; cmd?: string }
        if (proc.name && !baselineProcs.has(proc.name)) unseen.push(proc.name)
        const parent = proc.ppid != null ? parentMap.get(proc.ppid) : undefined
        if (parent && proc.name) {
          const key = `${parent}->${proc.name}`
          if (!baselinePairs.has(key)) newPairs.push(key)
        }
        if (proc.name && proc.cmd && processBaseline.cmd_entropies && processBaseline.cmd_entropies[proc.name]) {
          const base = processBaseline.cmd_entropies[proc.name]
          const ent = calculateEntropy(proc.cmd)
          if (base.count > 5 && ent > base.max + 0.5) {
             anomalies.push({
               anomaly_type: 'obfuscated_command',
               severity: 'high',
               evidence: { process: proc.name, cmd: proc.cmd, entropy: ent.toFixed(2), avg_baseline: base.avg.toFixed(2) },
               baseline_ref: { base_max: base.max.toFixed(2), sample_count: base.count }
             })
          }
        }
      }
      const uniqueUnseen = [...new Set(unseen)]
      if (uniqueUnseen.length > 0) {
        anomalies.push({
          anomaly_type: 'unseen_process',
          severity: uniqueUnseen.length > 3 ? 'high' : 'medium',
          evidence: { processes: uniqueUnseen.slice(0, 20) },
          baseline_ref: { source: 'process_set', baseline_size: baselineProcs.size },
        })
      }
      const uniqueNewPairs = [...new Set(newPairs)]
      const suspiciousPairs = uniqueNewPairs.filter(p =>
        /(powershell|cmd\.exe|wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin)->.+/i.test(p) ||
        /.+->(powershell|cmd\.exe|wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin)/i.test(p),
      )
      if (suspiciousPairs.length > 0) {
        anomalies.push({
          anomaly_type: 'suspicious_parent_child_pair',
          severity: 'high',
          evidence: { pairs: suspiciousPairs },
          baseline_ref: { source: 'parent_child_pairs' },
        })
      } else if (uniqueNewPairs.length > 5) {
        anomalies.push({
          anomaly_type: 'new_parent_child_pair',
          severity: 'low',
          evidence: { pairs: uniqueNewPairs.slice(0, 20), count: uniqueNewPairs.length },
          baseline_ref: { source: 'parent_child_pairs' },
        })
      }
    }

    const loginBaseline = baselineMap.get('login_hour_distribution') as LoginHistogram | undefined
    if (loginBaseline) {
      const recentLogins = await db.query<{ hour: string; count: string }>(
        `SELECT EXTRACT(HOUR FROM timestamp)::TEXT AS hour, COUNT(*)::TEXT AS count
           FROM siem_alerts
          WHERE agent_id = $1
            AND timestamp >= $2
            AND (rule_description ILIKE '%login%' OR rule_description ILIKE '%authentication%' OR rule_description ILIKE '%logged in%')
          GROUP BY 1`,
        [agentId, since],
      )
      for (const r of recentLogins.rows) {
        const baselineCount = loginBaseline.hour_counts[r.hour] ?? 0
        const total = loginBaseline.total_samples || 1
        const baselineFraction = baselineCount / total
        if (baselineFraction < 0.01 && parseInt(r.count, 10) > 0) {
          anomalies.push({
            anomaly_type: 'off_hours_login',
            severity: 'medium',
            evidence: { hour_utc: r.hour, recent_count: parseInt(r.count, 10) },
            baseline_ref: { hour_baseline: baselineCount, total_baseline: total },
          })
        }
      }
    }

    const ubaBaseline = baselineMap.get('user_ip_baseline') as { user_ips: Record<string, string[]> } | undefined
    if (ubaBaseline) {
      const recentUbaLogins = await db.query<{ username: string; ip: string }>(
        `SELECT raw_log->>'user' AS username, src_ip::text AS ip
           FROM siem_alerts
          WHERE agent_id = $1
            AND timestamp >= $2
            AND (rule_description ILIKE '%login%' OR rule_description ILIKE '%authentication%')
            AND raw_log->>'user' IS NOT NULL
            AND src_ip IS NOT NULL`,
        [agentId, since],
      )
      for (const r of recentUbaLogins.rows) {
        if (r.username && r.ip) {
          const knownIps = ubaBaseline.user_ips[r.username] || []
          if (knownIps.length > 0 && !knownIps.includes(r.ip)) {
            anomalies.push({
              anomaly_type: 'impossible_travel_or_new_ip',
              severity: 'high',
              evidence: { user: r.username, anomalous_ip: r.ip },
              baseline_ref: { known_ips: knownIps },
            })
          }
        }
      }
    }

    const fileBaseline = baselineMap.get('file_write_rate') as { events_per_day: number } | undefined
    if (fileBaseline) {
      const recentFim = await db.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
           FROM siem_alerts
          WHERE agent_id = $1
            AND timestamp >= $2
            AND (rule_description ILIKE '%integrity%' OR rule_description ILIKE '%modified%')`,
        [agentId, since],
      )
      const recent = parseInt(recentFim.rows[0]?.count ?? '0', 10)
      const expected = (fileBaseline.events_per_day / 24) * hours
      if (expected > 0 && recent > expected * 5) {
        anomalies.push({
          anomaly_type: 'file_write_spike',
          severity: recent > expected * 20 ? 'high' : 'medium',
          evidence: { recent_count: recent, hours, expected_for_window: expected.toFixed(2) },
          baseline_ref: { source: 'file_write_rate' },
        })
      }
    }

    const netBaseline = baselineMap.get('network_dest_diversity') as { unique_destinations: number } | undefined
    if (netBaseline) {
      const uniquePorts = new Set<string>()
      const smbPeers = new Set<string>()
      for (const p of ports) {
        const port = p as { remote_ip?: string; remote_port?: number; state?: string }
        if (port.remote_ip && port.state === 'established') {
            uniquePorts.add(port.remote_ip)
            if (port.remote_port === 445 || port.remote_port === 135) {
                smbPeers.add(port.remote_ip)
            }
        }
      }
      if (netBaseline.unique_destinations > 0 && uniquePorts.size > netBaseline.unique_destinations * 3) {
        anomalies.push({
          anomaly_type: 'network_destination_explosion',
          severity: 'high',
          evidence: { current_unique: uniquePorts.size, sample: [...uniquePorts].slice(0, 20) },
          baseline_ref: { baseline_unique: netBaseline.unique_destinations },
        })
      }
      const baseSmb = (netBaseline as any).smb_peers || 0;
      if (baseSmb > 0 && smbPeers.size > baseSmb * 4 && smbPeers.size > 5) {
        anomalies.push({
          anomaly_type: 'lateral_movement_smb_spike',
          severity: 'critical',
          evidence: { smb_peer_count: smbPeers.size, peers: [...smbPeers].slice(0, 20) },
          baseline_ref: { baseline_smb_peers: baseSmb },
        })
      }
    }

    const inserted: string[] = []
    for (const a of anomalies) {
      const r = await db.query<{ id: string }>(
        `INSERT INTO behavioral_anomalies (agent_id, anomaly_type, severity, evidence, baseline_ref)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [agentId, a.anomaly_type, a.severity, JSON.stringify(a.evidence), JSON.stringify(a.baseline_ref)],
      )
      inserted.push(r.rows[0].id)
    }

    await logger.audit('analyze_agent_behavior', { agentId, lookbackHours: hours }, { count: anomalies.length }, Date.now() - start)
    return { agentId, lookbackHours: hours, anomalies, anomalyIds: inserted }
  },
})

export const correlateAnomaliesWithAlertsTool = new FunctionTool({
  name: 'correlate_anomalies_with_alerts',
  description: `Find behavioral_anomalies that overlap in time with siem_alerts on the same agent.
A correlated pair is strong evidence the alert is a true positive — call this BEFORE verify_incident.`,
  parameters: z.object({
    agentId: z.string(),
    timeWindowMinutes: z.number().optional().describe('Window around each alert (default 30)'),
  }),
  execute: async ({ agentId, timeWindowMinutes }) => {
    const start = Date.now()
    const win = timeWindowMinutes ?? 30

    const r = await db.query(
      `SELECT a.id AS alert_id, a.timestamp AS alert_ts, a.rule_description, a.severity,
              b.id AS anomaly_id, b.anomaly_type, b.severity AS anomaly_severity, b.evidence
         FROM siem_alerts a
         JOIN behavioral_anomalies b
           ON b.agent_id = a.agent_id
          AND b.detected_at BETWEEN a.timestamp - ($2 || ' minutes')::interval
                                AND a.timestamp + ($2 || ' minutes')::interval
        WHERE a.agent_id = $1
          AND a.timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY a.timestamp DESC
        LIMIT 100`,
      [agentId, String(win)],
    )

    await logger.audit('correlate_anomalies_with_alerts', { agentId, timeWindowMinutes: win }, { pairs: r.rowCount }, Date.now() - start)
    return { agentId, pairs: r.rows, count: r.rowCount }
  },
})
