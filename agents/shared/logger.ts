import { db } from './db-client.js'
import { publish } from './redis-client.js'
import { v4 as uuid } from 'uuid'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  agent: string
  message: string
  data?: Record<string, unknown>
}

function formatLog(entry: LogEntry): string {
  const ts = new Date().toISOString()
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : ''
  return `[${ts}] [${entry.level.toUpperCase()}] [${entry.agent}] ${entry.message}${data}`
}

export function createLogger(agentName: string) {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      console.debug(formatLog({ level: 'debug', agent: agentName, message, data }))
    },

    info(message: string, data?: Record<string, unknown>) {
      console.info(formatLog({ level: 'info', agent: agentName, message, data }))
    },

    warn(message: string, data?: Record<string, unknown>) {
      console.warn(formatLog({ level: 'warn', agent: agentName, message, data }))
    },

    error(message: string, data?: Record<string, unknown>) {
      console.error(formatLog({ level: 'error', agent: agentName, message, data }))
    },

    async audit(
      toolName: string,
      input: Record<string, unknown>,
      output: Record<string, unknown>,
      durationMs: number,
      campaignId?: string
    ): Promise<string> {
      const id = uuid()
      const timestamp = new Date().toISOString()
      const raw = campaignId ?? process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID ?? null
      const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i
      const finalCampaignId = (raw && UUID_RE.test(raw)) ? raw : null

      try {
        await db.query(
          `INSERT INTO audit_log (id, timestamp, agent_name, tool_name, input, output, campaign_id, duration_ms)
           VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
          [id, agentName, toolName, JSON.stringify(input), JSON.stringify(output), finalCampaignId, durationMs]
        )
      } catch (err: any) {
        if (err.code === '23503') { // Foreign key violation
          // The provided campaignId doesn't exist in the database (likely hallucinated by LLM or outdated)
          // Insert the audit log without a campaign_id rather than losing the audit completely
          try {
            await db.query(
              `INSERT INTO audit_log (id, timestamp, agent_name, tool_name, input, output, campaign_id, duration_ms)
               VALUES ($1, NOW(), $2, $3, $4, $5, NULL, $7)`,
              [id, agentName, toolName, JSON.stringify(input), JSON.stringify(output), durationMs]
            )
          } catch (fallbackErr) {
            console.error(`Failed to write fallback audit log:`, fallbackErr)
          }
        } else {
          console.error(`Failed to write audit log:`, err)
        }
      }

      try {
        // Fire-and-forget publish to Redis for frontend live updates
        publish('audit_stream', {
          id,
          timestamp,
          agent_name: agentName,
          tool_name: toolName,
          input,
          output,
          campaign_id: finalCampaignId,
          duration_ms: durationMs,
        }).catch(() => {})
      } catch (err) {
        // Ignore publish errors
      }
      
      return id
    },
  }
}
