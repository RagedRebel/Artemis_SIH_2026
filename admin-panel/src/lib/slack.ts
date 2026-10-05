import { WebClient, type KnownBlock } from '@slack/web-api'
import { db } from './db'

export interface SlackConnection {
  id: string
  team_id: string
  team_name: string
  bot_token: string
  bot_user_id: string | null
  channel_id: string | null
  channel_name: string | null
  incoming_webhook_url: string | null
  connected_by: string | null
  notify_incidents: boolean
  notify_approvals: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export function getSlackAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    scope: 'chat:write,channels:read,channels:join,groups:read,incoming-webhook',
    redirect_uri: process.env.SLACK_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/slack/callback`,
    state,
  })
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

export async function exchangeSlackCode(code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/slack/callback`,
    }),
  })

  const data = await res.json()
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`)
  return data as {
    ok: boolean
    access_token: string
    token_type: string
    scope: string
    bot_user_id: string
    team: { id: string; name: string }
    incoming_webhook?: { channel: string; channel_id: string; url: string }
  }
}

function getClient(connection: SlackConnection): WebClient {
  return new WebClient(connection.bot_token)
}

export async function postMessage(
  connection: SlackConnection,
  channel: string,
  blocks: KnownBlock[],
  text: string
) {
  const client = getClient(connection)
  try {
    return await client.chat.postMessage({ channel, blocks, text })
  } catch (err: unknown) {
    const slackError = (err as Record<string, unknown>)?.data as Record<string, unknown> | undefined
    if (slackError?.error === 'not_in_channel') {
      try {
        await client.conversations.join({ channel })
      } catch {
        console.error(`[slack] Could not auto-join channel ${channel}. Invite the bot manually with /invite @Artemis AI`)
      }
      return client.chat.postMessage({ channel, blocks, text })
    }
    throw err
  }
}

export async function updateMessage(
  connection: SlackConnection,
  channel: string,
  ts: string,
  blocks: KnownBlock[],
  text: string
) {
  const client = getClient(connection)
  return client.chat.update({ channel, ts, blocks, text })
}

export async function listChannels(connection: SlackConnection) {
  const client = getClient(connection)
  const result = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 200,
    exclude_archived: true,
  })
  return result.channels ?? []
}

export async function getActiveSlackConnections(filter?: {
  notify_incidents?: boolean
  notify_approvals?: boolean
}): Promise<SlackConnection[]> {
  let query = 'SELECT * FROM slack_connections WHERE is_active = true'
  const params: unknown[] = []

  if (filter?.notify_incidents) {
    params.push(true)
    query += ` AND notify_incidents = $${params.length}`
  }
  if (filter?.notify_approvals) {
    params.push(true)
    query += ` AND notify_approvals = $${params.length}`
  }

  const result = await db.query(query, params)
  return result.rows
}

export function buildApprovalBlocks(approval: {
  approvalId: string
  agentName: string
  actionDescription: string
  command: string
  riskLevel: string
  campaignId: string
}): KnownBlock[] {
  const riskEmoji =
    approval.riskLevel === 'critical'
      ? ':red_circle:'
      : approval.riskLevel === 'high'
        ? ':large_orange_circle:'
        : ':large_yellow_circle:'

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: ':shield: Approval Request', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${approval.agentName}` },
        { type: 'mrkdwn', text: `*Risk Level:*\n${riskEmoji} ${approval.riskLevel.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Campaign:*\n\`${approval.campaignId}\`` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action:*\n${approval.actionDescription}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Command:*\n\`\`\`${approval.command}\`\`\`` },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve', emoji: true },
          style: 'primary',
          action_id: 'approve_request',
          value: approval.approvalId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deny', emoji: true },
          style: 'danger',
          action_id: 'deny_request',
          value: approval.approvalId,
        },
      ],
    },
  ]
}

export function buildApprovalResultBlocks(approval: {
  agentName: string
  actionDescription: string
  command: string
  riskLevel: string
  decision: 'approved' | 'denied'
  respondedBy: string
}): KnownBlock[] {
  const statusEmoji = approval.decision === 'approved' ? ':white_check_mark:' : ':x:'

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: ':shield: Approval Request', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${approval.agentName}` },
        { type: 'mrkdwn', text: `*Risk Level:*\n${approval.riskLevel.toUpperCase()}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action:*\n${approval.actionDescription}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${statusEmoji} *${approval.decision === 'approved' ? 'Approved' : 'Denied'}* by ${approval.respondedBy}`,
        },
      ],
    },
  ]
}

export function buildIncidentBlocks(incident: {
  id: string
  title: string
  description: string
  severity: string
  affectedHosts: string[]
  jiraUrl?: string | null
  appUrl: string
}): KnownBlock[] {
  const severityEmoji =
    incident.severity === 'critical'
      ? ':rotating_light:'
      : incident.severity === 'high'
        ? ':warning:'
        : ':information_source:'

  const actionElements = [
    {
      type: 'button' as const,
      text: { type: 'plain_text' as const, text: 'View in Artemis', emoji: true },
      url: `${incident.appUrl}/incidents`,
      action_id: 'view_artemis',
    },
  ]

  if (incident.jiraUrl) {
    actionElements.push({
      type: 'button' as const,
      text: { type: 'plain_text' as const, text: 'View JIRA Ticket', emoji: true },
      url: incident.jiraUrl,
      action_id: 'view_jira',
    })
  }

  const truncatedDesc =
    incident.description.length > 300
      ? incident.description.slice(0, 297) + '...'
      : incident.description

  return [
    {
      type: 'header' as const,
      text: { type: 'plain_text' as const, text: `${severityEmoji} New Incident: ${incident.title}`, emoji: true },
    },
    {
      type: 'section' as const,
      fields: [
        { type: 'mrkdwn' as const, text: `*Severity:*\n${incident.severity.toUpperCase()}` },
        { type: 'mrkdwn' as const, text: `*Status:*\nOpen` },
        {
          type: 'mrkdwn' as const,
          text: `*Affected Hosts:*\n${incident.affectedHosts.length > 0 ? incident.affectedHosts.join(', ') : 'N/A'}`,
        },
      ],
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: truncatedDesc },
    },
    { type: 'divider' as const },
    {
      type: 'actions' as const,
      elements: actionElements,
    },
  ] satisfies KnownBlock[]
}
