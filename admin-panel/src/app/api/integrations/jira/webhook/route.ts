import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const webhookEvent = body.webhookEvent
    if (webhookEvent !== 'jira:issue_updated') {
      return NextResponse.json({ ignored: true })
    }

    const issue = body.issue
    if (!issue) {
      return NextResponse.json({ ignored: true })
    }

    const issueKey = issue.key as string
    const status = issue.fields?.status?.name?.toLowerCase() as string

    const doneStatuses = ['done', 'resolved', 'closed', 'complete', 'completed']
    if (!doneStatuses.includes(status)) {
      return NextResponse.json({ ignored: true, reason: 'not_done_status' })
    }

    const mapping = await db.query(
      `SELECT incident_id FROM incident_jira_map WHERE jira_issue_key = $1`,
      [issueKey]
    )

    if (mapping.rows.length === 0) {
      return NextResponse.json({ ignored: true, reason: 'no_mapping' })
    }

    const incidentId = mapping.rows[0].incident_id

    const incident = await db.query(
      `SELECT status FROM incidents WHERE id = $1`,
      [incidentId]
    )

    if (incident.rows[0]?.status === 'resolved' || incident.rows[0]?.status === 'false_positive') {
      return NextResponse.json({ ignored: true, reason: 'already_resolved' })
    }

    await db.query(
      `UPDATE incidents SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
      [incidentId]
    )

    return NextResponse.json({ success: true, incidentId, resolvedVia: 'jira_webhook' })
  } catch (err) {
    console.error('Jira webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
