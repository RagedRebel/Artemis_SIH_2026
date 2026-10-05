export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/lib/db'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { JiraConnectionCard } from './jira-connection-card'

async function getJiraConnections() {
  try {
    const result = await db.query(
      `SELECT id, site_url, cloud_id, project_key, issue_type, is_active, created_at, updated_at
       FROM jira_connections WHERE is_active = true ORDER BY created_at DESC`
    )
    return result.rows
  } catch {
    return []
  }
}

export default async function JiraSettingsPage() {
  const connections = await getJiraConnections()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Integrations"
        title="Jira"
        description="Connect your Jira Cloud workspace to automatically sync incidents as tickets."
        aside={
          <Link href="/integrations" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; All Integrations
          </Link>
        }
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Connected Workspaces</h2>
          <Button asChild variant="default" size="sm">
            <a href="/api/integrations/jira/auth">Connect Jira</a>
          </Button>
        </div>

        {connections.length === 0 ? (
          <Card className="border-dashed border-zinc-300/90 bg-white/80">
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
                  <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84H11.53Zm-4.67 4.65c0 2.4 1.97 4.35 4.35 4.36h1.78v1.7c0 2.4 1.95 4.35 4.35 4.35V7.5a.84.84 0 0 0-.84-.84H6.86ZM2.19 11.31c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7C8.32 19.76 10.27 21.71 12.67 21.71V12.15a.84.84 0 0 0-.84-.84H2.19Z" />
                </svg>
              </div>
              <p className="text-base font-medium text-zinc-700">No Jira workspaces connected</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-zinc-500">
                Connect your Atlassian account to start syncing incidents as Jira tickets automatically.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <a href="/api/integrations/jira/auth">Connect to Jira</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {connections.map((conn: Record<string, unknown>) => (
              <JiraConnectionCard
                key={conn.id as string}
                id={conn.id as string}
                siteUrl={conn.site_url as string}
                projectKey={(conn.project_key as string) ?? ''}
                issueType={(conn.issue_type as string) ?? 'Task'}
                createdAt={String(conn.created_at)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h3 className="text-sm font-semibold text-zinc-800">How it works</h3>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-zinc-600">
          <li>When an incident is created, a Jira ticket is automatically created in the configured project.</li>
          <li>Closing an incident in Artemis transitions the Jira ticket to Done.</li>
          <li>Resolving the Jira ticket automatically closes the incident in Artemis.</li>
          <li>Multiple Jira workspaces can be connected simultaneously.</li>
        </ul>
      </section>
    </div>
  )
}
