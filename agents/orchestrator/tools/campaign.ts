import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { publish } from '../../shared/redis-client.js'
import { createLogger } from '../../shared/logger.js'
import { v4 as uuid } from 'uuid'

const logger = createLogger('orchestrator_agent')

export const createCampaignTool = new FunctionTool({
  name: 'create_campaign',
  description: 'Create a new security assessment campaign with defined target scope and risk level.',
  parameters: z.object({
    name: z.string().describe('Name of the campaign'),
    targetScope: z.array(z.string()).describe('Array of CIDR ranges or IP addresses to scan'),
    maxRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('Maximum allowed risk level for automated actions'),
    createdBy: z.string().describe('Email or username of the campaign creator'),
  }),
  execute: async ({ name, targetScope, maxRiskLevel, createdBy }) => {
    const start = Date.now()

    /** Admin panel + Redis job set this so we reuse the queued row instead of inserting a duplicate. */
    const seeded = process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID?.trim()
    if (seeded) {
      const existing = await db.query(
        'SELECT id, name, target_scope, status FROM campaigns WHERE id = $1',
        [seeded]
      )
      const row = existing.rows[0] as
        | { id: string; name: string; target_scope: string[]; status: string }
        | undefined

      if (row?.status === 'running') {
        return { campaignId: seeded, status: 'running', targetScope: row.target_scope }
      }

      if (row?.status === 'queued') {
        await db.query(
          `UPDATE campaigns
           SET status = 'running', started_at = COALESCE(started_at, NOW()), max_risk_level = $2, created_by = COALESCE(created_by, $3)
           WHERE id = $1`,
          [seeded, maxRiskLevel, createdBy]
        )
        await publish('campaign_status', {
          campaignId: seeded,
          status: 'running',
          message: `Campaign "${row.name}" started (from admin queue)`,
        })
        await logger.audit(
          'create_campaign',
          { name: row.name, targetScope: row.target_scope, maxRiskLevel, createdBy, adoptedExistingRow: true },
          { campaignId: seeded },
          Date.now() - start,
          seeded
        )
        return { campaignId: seeded, status: 'running', targetScope: row.target_scope }
      }
    }

    const campaignId = uuid()

    await db.query(
      `INSERT INTO campaigns (id, name, target_scope, status, max_risk_level, created_by, started_at)
       VALUES ($1, $2, $3, 'running', $4, $5, NOW())`,
      [campaignId, name, targetScope, maxRiskLevel, createdBy]
    )

    await publish('campaign_status', { campaignId, status: 'running', message: `Campaign "${name}" started` })
    await logger.audit('create_campaign', { name, targetScope, maxRiskLevel }, { campaignId }, Date.now() - start, campaignId)

    return { campaignId, status: 'running', targetScope }
  },
})

export const updateCampaignTool = new FunctionTool({
  name: 'update_campaign',
  description: 'Update the status of an existing campaign.',
  parameters: z.object({
    campaignId: z.string().describe('UUID of the campaign to update'),
    status: z.enum(['queued', 'running', 'paused', 'completed', 'failed', 'aborted']).describe('New campaign status'),
    message: z.string().optional().describe('Optional status message'),
  }),
  execute: async ({ campaignId, status, message }) => {
    const start = Date.now()

    await db.query(
      'UPDATE campaigns SET status = $1 WHERE id = $2',
      [status, campaignId]
    )

    await publish('campaign_status', { campaignId, status, message: message ?? `Campaign status updated to ${status}` })
    await logger.audit('update_campaign', { campaignId, status }, { updated: true }, Date.now() - start, campaignId)

    return { campaignId, status, updated: true }
  },
})

export const closeCampaignTool = new FunctionTool({
  name: 'close_campaign',
  description: 'Close a campaign, marking it as completed and recording the end time.',
  parameters: z.object({
    campaignId: z.string().describe('UUID of the campaign to close'),
    summary: z.string().describe('Final summary of the campaign results. MUST be a rich markdown report including ## ✅ Campaign Complete, ### Summary (tables), ### Key Findings, and ### Recommendations.'),
  }),
  execute: async ({ campaignId, summary }) => {
    const start = Date.now()

    const result = await db.query(
      `UPDATE campaigns SET status = 'completed', ended_at = NOW() WHERE id = $1 RETURNING findings_count`,
      [campaignId]
    )

    const findingsCount = result.rows[0]?.findings_count ?? 0
    await publish('campaign_status', { campaignId, status: 'completed', message: summary, findingsCount })
    await logger.audit('close_campaign', { campaignId, summary }, { findingsCount }, Date.now() - start, campaignId)

    return { campaignId, status: 'completed', findingsCount, summary }
  },
})
