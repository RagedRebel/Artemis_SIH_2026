import { db } from '../db'
import { getActiveJiraConnections, createIssue, transitionIssue } from '../jira'

export async function syncIncidentToJira(incidentId: string) {
  const connections = await getActiveJiraConnections()
  if (connections.length === 0) return

  const incidentRow = await db.query(
    `SELECT id, title, description, severity, affected_hosts FROM incidents WHERE id = $1`,
    [incidentId]
  )
  const incident = incidentRow.rows[0]
  if (!incident) return

  for (const conn of connections) {
    if (!conn.project_key) continue

    const existing = await db.query(
      `SELECT id FROM incident_jira_map WHERE incident_id = $1 AND jira_connection_id = $2`,
      [incidentId, conn.id]
    )
    if (existing.rows.length > 0) continue

    try {
      const issue = await createIssue(conn, {
        summary: `[Artemis] ${incident.title}`,
        description: incident.description,
        severity: incident.severity,
        labels: (incident.affected_hosts ?? []).map((h: string) => h.replace(/[^a-zA-Z0-9._-]/g, '_')),
      })

      const issueUrl = `${conn.site_url}/browse/${issue.key}`

      await db.query(
        `INSERT INTO incident_jira_map (incident_id, jira_connection_id, jira_issue_id, jira_issue_key, jira_issue_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [incidentId, conn.id, issue.id, issue.key, issueUrl]
      )
    } catch (err) {
      console.error(`Failed to sync incident ${incidentId} to Jira (${conn.site_url}):`, err)
    }
  }
}

export async function closeIncidentInJira(incidentId: string) {
  const mappings = await db.query(
    `SELECT m.jira_issue_key, m.jira_connection_id, j.*
     FROM incident_jira_map m
     JOIN jira_connections j ON j.id = m.jira_connection_id
     WHERE m.incident_id = $1 AND j.is_active = true`,
    [incidentId]
  )

  for (const row of mappings.rows) {
    try {
      await transitionIssue(row, row.jira_issue_key, 'Done')
    } catch (err) {
      console.error(`Failed to transition Jira issue ${row.jira_issue_key}:`, err)
    }
  }
}
