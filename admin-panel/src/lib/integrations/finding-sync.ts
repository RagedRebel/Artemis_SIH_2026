import { db } from '../db'
import { getActiveJiraConnections, createIssue } from '../jira'
import { getActiveSlackConnections, postMessage } from '../slack'

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:5173'

interface FindingRow {
  id: string
  title: string
  description: string | null
  severity: string
  affected_host: string | null
  affected_service: string | null
  campaign_id: string | null
  status: string
}

async function loadFinding(findingId: string): Promise<FindingRow | null> {
  const res = await db.query(
    `SELECT id, title, description, severity, affected_host, affected_service, campaign_id, status
       FROM findings WHERE id = $1`,
    [findingId]
  )
  return res.rows[0] ?? null
}

export async function syncFindingToJira(findingId: string) {
  const finding = await loadFinding(findingId)
  if (!finding || finding.status !== 'verified') return

  const connections = await getActiveJiraConnections()
  for (const conn of connections) {
    if (!conn.project_key) continue

    const existing = await db.query(
      `SELECT 1 FROM finding_jira_map WHERE finding_id = $1 AND jira_connection_id = $2`,
      [findingId, conn.id]
    )
    if (existing.rows.length > 0) continue

    try {
      const labels: string[] = []
      if (finding.affected_host) labels.push(finding.affected_host.replace(/[^a-zA-Z0-9._-]/g, '_'))
      if (finding.affected_service) labels.push(finding.affected_service.replace(/[^a-zA-Z0-9._-]/g, '_'))

      const issue = await createIssue(conn, {
        summary: `[Artemis] ${finding.title}`,
        description: finding.description ?? '',
        severity: finding.severity,
        labels,
      })
      const issueUrl = `${conn.site_url}/browse/${issue.key}`
      await db.query(
        `INSERT INTO finding_jira_map (finding_id, jira_connection_id, jira_issue_id, jira_issue_key, jira_issue_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [findingId, conn.id, issue.id, issue.key, issueUrl]
      )
    } catch (err) {
      console.error(`[finding-sync] jira create failed for ${findingId}:`, err)
    }
  }
}

export async function notifySlackFinding(findingId: string, mode: 'verified' | 'needs_review') {
  const finding = await loadFinding(findingId)
  if (!finding) return

  const filter = mode === 'verified' ? { notify_incidents: true } : { notify_approvals: true }
  const connections = await getActiveSlackConnections(filter)
  if (connections.length === 0) return

  const title =
    mode === 'verified'
      ? `Verified finding: ${finding.title}`
      : `Pentest review required: ${finding.title}`

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: title, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Severity*\n${finding.severity.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Host*\n${finding.affected_host ?? 'n/a'}` },
        { type: 'mrkdwn', text: `*Service*\n${finding.affected_service ?? 'n/a'}` },
        { type: 'mrkdwn', text: `*Status*\n${finding.status}` },
      ],
    },
    finding.description
      ? { type: 'section', text: { type: 'mrkdwn', text: finding.description.slice(0, 2800) } }
      : null,
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: mode === 'verified' ? 'View finding' : 'Review now' },
          url: `${APP_URL}/findings/review`,
        },
      ],
    },
  ].filter(Boolean) as unknown[]

  for (const conn of connections) {
    const channel = conn.channel_id
    if (!channel) continue
    try {
      await postMessage(conn, channel, blocks as Parameters<typeof postMessage>[2], title)
    } catch (err) {
      console.error(`[finding-sync] slack send failed (${conn.team_name}):`, err)
    }
  }
}
