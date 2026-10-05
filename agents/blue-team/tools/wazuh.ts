import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { createLogger } from '../../shared/logger.js'

if (process.env.WAZUH_VERIFY_SSL === 'false') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const logger = createLogger('blue_team_agent')
import { db } from '../../shared/db-client.js'
import { redis } from '../../shared/redis-client.js'
import { v4 as uuid } from 'uuid'

const WAZUH_URL = process.env.WAZUH_API_URL ?? 'https://localhost:55000'
const WAZUH_USER = process.env.WAZUH_API_USER ?? 'wazuh-wui'
const WAZUH_PASS = process.env.WAZUH_API_PASSWORD ?? ''

logger.info(`Wazuh config: url=${WAZUH_URL} user=${WAZUH_USER}`)

let authToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (authToken && Date.now() < tokenExpiry) return authToken

  try {
    const url = `${WAZUH_URL}/security/user/authenticate`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${WAZUH_USER}:${WAZUH_PASS}`).toString('base64'),
      },
    })
    if (!res.ok) {
      throw new Error(`Wazuh auth failed (${res.status})`)
    }
    const data = await res.json() as any
    authToken = data.data?.token ?? null
    tokenExpiry = Date.now() + 14 * 60 * 1000
    return authToken!
  } catch (err) {
    throw err
  }
}

export async function wazuhFetch(path: string): Promise<any> {
  const token = await getToken()
  const url = `${WAZUH_URL}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    return { error: `Wazuh API ${res.status}` }
  }
  return res.json()
}

export const getAlertsTool = new FunctionTool({
  name: 'get_wazuh_alerts',
  description:
    'Fetch security alerts from the SIEM database. Returns structured metadata (no raw logs) to keep context manageable.',
  parameters: z.object({
    minSeverity: z.number().optional().describe('Minimum severity level of alert (1 to 15, default 6)'),
    limit: z.number().optional().describe('Max entries to return (default 50, max 50)'),
  }),
  execute: async ({ minSeverity, limit }) => {
    const cap = Math.min(limit ?? 50, 50)
    try {
      const dbResult = await db.query(
        `SELECT id, timestamp, agent_name, rule_id, rule_description, rule_mitre, severity, src_ip, dst_ip
         FROM siem_alerts
         WHERE severity >= $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [minSeverity ?? 6, cap]
      )

      return { data: { items: dbResult.rows, total: dbResult.rowCount } }
    } catch (err) {
      logger.error('get_wazuh_alerts failed', { error: String(err) })
      return { error: `get_wazuh_alerts failed: ${(err as Error).message}` }
    }
  },
})
export const drainRedisAlertsTool = new FunctionTool({
  name: 'drain_redis_alerts',
  description: 'Pulls all pending Wazuh alert logs out of the Redis queue and saves them to the SIEM database. MUST be called before get_wazuh_alerts.',
  parameters: z.object({}),
  execute: async () => {
    let count = 0;
    try {
      while (true) {
        const item = await redis.lpop('wazuh_alerts');
        if (!item) break; // queue is empty

        const raw = item;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) { continue; }

        let alert = parsed;
        if (parsed.message && typeof parsed.message === 'string') {
          try {
            alert = JSON.parse(parsed.message);
          } catch(e) {}
        }

        if (!alert || !alert.rule) continue;

        const id = uuid();
        const timestamp = alert.timestamp || new Date().toISOString();
        const agentId = alert.agent?.id || '000';
        const agentName = alert.agent?.name || 'unknown';
        const ruleId = parseInt(alert.rule?.id || '0', 10) || 0;
        const ruleDesc = alert.rule?.description || 'Unknown event';
        const mitre = alert.rule?.mitre ? { id: alert.rule.mitre.id?.[0], tactic: alert.rule.mitre.tactic?.[0] } : null;
        const severity = parseInt(alert.rule?.level || '1', 10) || 1;
        const srcIp = alert.agent?.ip || alert.data?.srcip || null;
        const dstIp = alert.data?.destip || null;

        await db.query(
          `INSERT INTO siem_alerts
            (id, timestamp, agent_id, agent_name, rule_id, rule_description, rule_mitre, severity, src_ip, dst_ip, raw_log)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
          [
            id, timestamp, agentId, agentName, ruleId, ruleDesc,
            JSON.stringify(mitre ? [mitre] : []),
            severity, srcIp, dstIp, JSON.stringify(alert)
          ]
        );
        count++;
      }
      return { data: { message: `Successfully drained ${count} new alerts from Redis into the SIEM database.` } };
    } catch (err) {
      logger.error('drain_redis_alerts failed', { error: String(err) })
      return { error: `drain_redis_alerts failed: ${(err as Error).message}` }
    }
  },
})
export const getManagerStatusTool = new FunctionTool({
  name: 'get_wazuh_manager_status',
  description: 'Get the status of all Wazuh manager daemons.',
  parameters: z.object({}),
  execute: async () => {
    try {
      return await wazuhFetch('/manager/status')
    } catch (err) {
      logger.error('get_wazuh_manager_status failed', { error: String(err) })
      return { error: `get_wazuh_manager_status failed: ${(err as Error).message}` }
    }
  },
})

export const getAgentsTool = new FunctionTool({
  name: 'get_wazuh_agents',
  description: 'List enrolled Wazuh agents with their connection status and OS info.',
  parameters: z.object({
    limit: z.number().optional().describe('Max agents to return (default 50)'),
    status: z
      .enum(['active', 'disconnected', 'never_connected', 'pending'])
      .optional()
      .describe('Filter agents by connection status'),
  }),
  execute: async ({ limit, status }) => {
    try {
      const q = new URLSearchParams({ limit: String(limit ?? 50) })
      if (status) q.set('status', status)
      return await wazuhFetch(`/agents?${q}`)
    } catch (err) {
      logger.error('get_wazuh_agents failed', { error: String(err) })
      return { error: `get_wazuh_agents failed: ${(err as Error).message}` }
    }
  },
})

export const getLogsSummaryTool = new FunctionTool({
  name: 'get_wazuh_logs_summary',
  description:
    'Get a summary of Wazuh manager log counts grouped by daemon, ' +
    'useful for quickly spotting which daemons have warnings or errors.',
  parameters: z.object({}),
  execute: async () => {
    try {
      return await wazuhFetch('/manager/logs/summary')
    } catch (err) {
      logger.error('get_wazuh_logs_summary failed', { error: String(err) })
      return { error: `get_wazuh_logs_summary failed: ${(err as Error).message}` }
    }
  },
})
