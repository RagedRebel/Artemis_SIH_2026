import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { publish } from '../../shared/redis-client.js'
import { v4 as uuid } from 'uuid'

export const writeAuditLogTool = new FunctionTool({
  name: 'write_audit_log',
  description: 'Write an immutable audit log entry for any significant decision or action.',
  parameters: z.object({
    agentName: z.string().describe('Name of the agent performing the action'),
    toolName: z.string().describe('Name of the tool or action being logged'),
    input: z.record(z.string(), z.unknown()).describe('Input parameters of the action'),
    output: z.record(z.string(), z.unknown()).describe('Output or result of the action'),
    campaignId: z.string().optional().describe('Associated campaign ID if applicable'),
    durationMs: z.number().describe('Duration of the action in milliseconds'),
  }),
  execute: async ({ agentName, toolName, input, output, campaignId, durationMs }) => {
    const id = uuid()
    const timestamp = new Date().toISOString()

    await db.query(
      `INSERT INTO audit_log (id, timestamp, agent_name, tool_name, input, output, campaign_id, duration_ms)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
      [id, agentName, toolName, JSON.stringify(input), JSON.stringify(output), campaignId ?? null, durationMs]
    )

    publish('audit_stream', {
      id,
      timestamp,
      agent_name: agentName,
      tool_name: toolName,
      input,
      output,
      campaign_id: campaignId ?? null,
      duration_ms: durationMs,
    }).catch(() => {})

    return { auditId: id, recorded: true }
  },
})
