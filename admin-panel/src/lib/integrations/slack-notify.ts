import { db } from '../db'
import {
  getActiveSlackConnections,
  postMessage,
  updateMessage,
  buildApprovalBlocks,
  buildApprovalResultBlocks,
  buildIncidentBlocks,
} from '../slack'

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:5173'

export async function notifySlackApproval(approval: {
  approvalId: string
  agentName: string
  actionDescription: string
  command: string
  riskLevel: string
  campaignId: string
}) {
  const connections = await getActiveSlackConnections({ notify_approvals: true })
  if (connections.length === 0) return

  const blocks = buildApprovalBlocks(approval)
  const text = `Approval Request: ${approval.actionDescription}`

  for (const conn of connections) {
    const channel = conn.channel_id
    if (!channel) continue

    try {
      const result = await postMessage(conn, channel, blocks, text)

      if (result.ts) {
        await db.query(
          `INSERT INTO approval_slack_map (approval_id, slack_connection_id, slack_channel_id, slack_message_ts)
           VALUES ($1, $2, $3, $4)`,
          [approval.approvalId, conn.id, channel, result.ts]
        )
      }
    } catch (err) {
      console.error(`Failed to send approval to Slack (${conn.team_name}):`, err)
    }
  }
}

export async function updateSlackApprovalMessage(
  approvalId: string,
  decision: 'approved' | 'denied',
  respondedBy: string,
  approvalDetails: { agentName: string; actionDescription: string; command: string; riskLevel: string }
) {
  const mappings = await db.query(
    `SELECT m.slack_channel_id, m.slack_message_ts, m.slack_connection_id, s.*
     FROM approval_slack_map m
     JOIN slack_connections s ON s.id = m.slack_connection_id
     WHERE m.approval_id = $1 AND s.is_active = true`,
    [approvalId]
  )

  const blocks = buildApprovalResultBlocks({
    ...approvalDetails,
    decision,
    respondedBy,
  })
  const text = `Approval ${decision}: ${approvalDetails.actionDescription}`

  for (const row of mappings.rows) {
    try {
      await updateMessage(row, row.slack_channel_id, row.slack_message_ts, blocks, text)
    } catch (err) {
      console.error(`Failed to update Slack approval message:`, err)
    }
  }
}

export async function notifySlackIncident(incident: {
  id: string
  title: string
  description: string
  severity: string
  affectedHosts: string[]
}) {
  const connections = await getActiveSlackConnections({ notify_incidents: true })
  if (connections.length === 0) return

  const jiraMap = await db.query(
    `SELECT jira_issue_url FROM incident_jira_map WHERE incident_id = $1 LIMIT 1`,
    [incident.id]
  )
  const jiraUrl = jiraMap.rows[0]?.jira_issue_url ?? null

  const blocks = buildIncidentBlocks({
    ...incident,
    jiraUrl,
    appUrl: APP_URL,
  })
  const text = `New Incident: ${incident.title} (${incident.severity.toUpperCase()})`

  for (const conn of connections) {
    const channel = conn.channel_id
    if (!channel) continue

    try {
      await postMessage(conn, channel, blocks, text)
    } catch (err) {
      console.error(`Failed to send incident to Slack (${conn.team_name}):`, err)
    }
  }
}
