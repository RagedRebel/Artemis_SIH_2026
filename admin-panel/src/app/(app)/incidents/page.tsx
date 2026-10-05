export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent } from '@/components/ui/card'
import { SeverityBadge } from '@/components/severity-badge'
import { AgentMarkdown } from '@/components/agent-markdown'
import { CloseIncidentButton } from '@/components/close-incident-button'

async function getIncidents() {
  try {
    const result = await db.query(
      `SELECT i.id, i.title, i.description, i.severity, i.status, i.created_at,
              m.jira_issue_key, m.jira_issue_url
       FROM incidents i
       LEFT JOIN incident_jira_map m ON m.incident_id = i.id
       ORDER BY i.created_at DESC LIMIT 100`
    )
    return result.rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      severity: r.severity,
      status: r.status,
      createdAt: r.created_at,
      jiraKey: r.jira_issue_key ?? null,
      jiraUrl: r.jira_issue_url ?? null,
    }))
  } catch (e) {
    console.error(e)
    return []
  }
}

export default async function IncidentsPage() {
  const incidents = await getIncidents()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Operations"
        title="Incidents"
        description="Security incidents created by the Blue Team agent based on severity."
      />

      {incidents.length === 0 ? (
        <Card className="border-dashed border-zinc-300/90 bg-white/80">
          <CardContent className="py-14 text-center">
            <p className="text-base font-medium text-zinc-700">No incidents to display</p>
            <p className="mt-2 max-w-sm mx-auto text-sm text-zinc-500">
              Incidents are generated when real threats are detected.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {incidents.map(inc => (
            <Card key={inc.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{inc.title}</h3>
                    <div className="mt-4 text-zinc-800">
                      <AgentMarkdown source={inc.description} />
                    </div>
                    <div className="mt-6 flex flex-col items-start gap-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="text-xs text-zinc-500">
                          Created: <span suppressHydrationWarning>{new Date(inc.createdAt).toLocaleString()}</span>
                        </div>
                        {inc.jiraKey && inc.jiraUrl && (
                          <a
                            href={inc.jiraUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100"
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                              <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84H11.53Zm-4.67 4.65c0 2.4 1.97 4.35 4.35 4.36h1.78v1.7c0 2.4 1.95 4.35 4.35 4.35V7.5a.84.84 0 0 0-.84-.84H6.86ZM2.19 11.31c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7C8.32 19.76 10.27 21.71 12.67 21.71V12.15a.84.84 0 0 0-.84-.84H2.19Z" />
                            </svg>
                            {inc.jiraKey}
                          </a>
                        )}
                      </div>
                      <CloseIncidentButton id={inc.id} status={inc.status} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                     <SeverityBadge severity={inc.severity} />
                     <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide bg-zinc-100 text-zinc-800">
                        {inc.status}
                     </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
