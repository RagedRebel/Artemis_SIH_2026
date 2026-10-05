import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { syncIncidentToJira } from '@/lib/integrations/jira-sync'
import { notifySlackIncident, notifySlackApproval } from '@/lib/integrations/slack-notify'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { type, id } = body as { type: string; id?: string }

  try {
    if (type === 'incident' && id) {
      await syncIncidentToJira(id)

      const row = await db.query(
        `SELECT id, title, description, severity, affected_hosts FROM incidents WHERE id = $1`,
        [id]
      )
      if (row.rows[0]) {
        await notifySlackIncident({
          id: row.rows[0].id,
          title: row.rows[0].title,
          description: row.rows[0].description,
          severity: row.rows[0].severity,
          affectedHosts: row.rows[0].affected_hosts ?? [],
        })
      }

      return NextResponse.json({ success: true, synced: 'incident', id })
    }

    if (type === 'all_incidents') {
      const unsyncedIncidents = await db.query(
        `SELECT i.id, i.title, i.description, i.severity, i.affected_hosts
         FROM incidents i
         LEFT JOIN incident_jira_map m ON m.incident_id = i.id
         WHERE m.id IS NULL AND i.status IN ('open', 'investigating')
         ORDER BY i.created_at DESC`
      )

      let synced = 0
      for (const inc of unsyncedIncidents.rows) {
        try {
          await syncIncidentToJira(inc.id)
          await notifySlackIncident({
            id: inc.id,
            title: inc.title,
            description: inc.description,
            severity: inc.severity,
            affectedHosts: inc.affected_hosts ?? [],
          })
          synced++
        } catch (err) {
          console.error(`Failed to sync incident ${inc.id}:`, err)
        }
      }

      return NextResponse.json({ success: true, synced, total: unsyncedIncidents.rows.length })
    }

    if (type === 'approval' && id) {
      const row = await db.query(
        `SELECT id, agent_name, action_description, command, risk_level, campaign_id
         FROM approval_requests WHERE id = $1`,
        [id]
      )
      if (row.rows[0]) {
        await notifySlackApproval({
          approvalId: row.rows[0].id,
          agentName: row.rows[0].agent_name,
          actionDescription: row.rows[0].action_description,
          command: row.rows[0].command,
          riskLevel: row.rows[0].risk_level,
          campaignId: row.rows[0].campaign_id,
        })
      }
      return NextResponse.json({ success: true, synced: 'approval', id })
    }

    if (type === 'all_approvals') {
      const pending = await db.query(
        `SELECT a.id, a.agent_name, a.action_description, a.command, a.risk_level, a.campaign_id
         FROM approval_requests a
         LEFT JOIN approval_slack_map m ON m.approval_id = a.id
         WHERE a.status = 'pending' AND m.id IS NULL`
      )

      let synced = 0
      for (const a of pending.rows) {
        try {
          await notifySlackApproval({
            approvalId: a.id,
            agentName: a.agent_name,
            actionDescription: a.action_description,
            command: a.command,
            riskLevel: a.risk_level,
            campaignId: a.campaign_id,
          })
          synced++
        } catch (err) {
          console.error(`Failed to sync approval ${a.id}:`, err)
        }
      }

      return NextResponse.json({ success: true, synced, total: pending.rows.length })
    }

    return NextResponse.json({ error: 'Invalid type. Use: incident, all_incidents, approval, all_approvals' }, { status: 400 })
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
