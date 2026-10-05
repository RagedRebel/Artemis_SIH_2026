import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { publish } from '../../shared/redis-client.js'
import { createLogger } from '../../shared/logger.js'
import { v4 as uuid } from 'uuid'

const logger = createLogger('orchestrator_agent')

export const requestApprovalTool = new FunctionTool({
  name: 'request_approval',
  description: 'Submit a high-risk action for human approval. Polls until approved, denied, or timed out.',
  parameters: z.object({
    campaignId: z.string().describe('Campaign ID this approval is for'),
    agentName: z.string().describe('Name of the requesting agent'),
    actionDescription: z.string().describe('Human-readable description of the proposed action'),
    command: z.string().describe('The exact command or operation to be approved'),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('Risk classification'),
    context: z.record(z.string(), z.unknown()).optional().describe('Additional context as key-value pairs'),
    timeoutMinutes: z.number().optional().describe('Timeout in minutes before auto-deny (default 30)'),
  }),
  execute: async ({ campaignId, agentName, actionDescription, command, riskLevel, context, timeoutMinutes }) => {
    const start = Date.now()
    const approvalId = uuid()
    const timeout = (timeoutMinutes ?? 30) * 60 * 1000

    await db.query(
      `INSERT INTO approval_requests (id, campaign_id, agent_name, action_description,
       command, risk_level, context, status, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [approvalId, campaignId, agentName, actionDescription, command, riskLevel, JSON.stringify(context ?? {})]
    )

    await publish('approval_queue', {
      approvalId, campaignId, agentName, actionDescription, command, riskLevel, context: context ?? {},
    })

    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const row = await db.query(
        'SELECT status FROM approval_requests WHERE id = $1',
        [approvalId]
      )
      if (row.rows[0]?.status === 'approved') {
        await logger.audit('request_approval', { approvalId, action: actionDescription }, { approved: true }, Date.now() - start, campaignId)
        return { approved: true, approvalId }
      }
      if (row.rows[0]?.status === 'denied') {
        await logger.audit('request_approval', { approvalId, action: actionDescription }, { approved: false, reason: 'Denied by admin' }, Date.now() - start, campaignId)
        return { approved: false, approvalId, reason: 'Denied by admin' }
      }
    }

    await db.query(
      "UPDATE approval_requests SET status = 'expired' WHERE id = $1",
      [approvalId]
    )
    await logger.audit('request_approval', { approvalId, action: actionDescription }, { approved: false, reason: 'Timed out' }, Date.now() - start, campaignId)
    return { approved: false, approvalId, reason: 'Approval request timed out' }
  },
})

export const checkApprovalStatusTool = new FunctionTool({
  name: 'check_approval_status',
  description: 'Check the current status of a pending approval request.',
  parameters: z.object({
    approvalId: z.string().describe('UUID of the approval request to check'),
  }),
  execute: async ({ approvalId }) => {
    const row = await db.query(
      'SELECT status, responded_by, responded_at FROM approval_requests WHERE id = $1',
      [approvalId]
    )
    if (!row.rows[0]) {
      return { error: 'Approval request not found' }
    }
    return {
      approvalId,
      status: row.rows[0].status,
      respondedBy: row.rows[0].responded_by,
      respondedAt: row.rows[0].responded_at,
    }
  },
})
