export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/lib/db'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SlackConnectionCard } from './slack-connection-card'

async function getSlackConnections() {
  try {
    const result = await db.query(
      `SELECT id, team_id, team_name, channel_id, channel_name, notify_incidents, notify_approvals, is_active, created_at
       FROM slack_connections WHERE is_active = true ORDER BY created_at DESC`
    )
    return result.rows
  } catch {
    return []
  }
}

export default async function SlackSettingsPage() {
  const connections = await getSlackConnections()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Integrations"
        title="Slack"
        description="Connect Slack workspaces to receive incident notifications and approve actions directly from Slack."
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
            <a href="/api/integrations/slack/auth">Add to Slack</a>
          </Button>
        </div>

        {connections.length === 0 ? (
          <Card className="border-dashed border-zinc-300/90 bg-white/80">
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-pink-50 text-[#E01E5A]">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52Zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313ZM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834Zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312ZM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834Zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312ZM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52Zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315Z" />
                </svg>
              </div>
              <p className="text-base font-medium text-zinc-700">No Slack workspaces connected</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-zinc-500">
                Add the Artemis bot to your Slack workspace to get real-time notifications and approvals.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <a href="/api/integrations/slack/auth">Add to Slack</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {connections.map((conn: Record<string, unknown>) => (
              <SlackConnectionCard
                key={conn.id as string}
                id={conn.id as string}
                teamName={conn.team_name as string}
                channelName={(conn.channel_name as string) ?? ''}
                channelId={(conn.channel_id as string) ?? ''}
                notifyIncidents={conn.notify_incidents as boolean}
                notifyApprovals={conn.notify_approvals as boolean}
                createdAt={String(conn.created_at)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h3 className="text-sm font-semibold text-zinc-800">Features</h3>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-zinc-600">
          <li>Receive notifications when new incidents are created, with links to Artemis and Jira.</li>
          <li>Approve or deny agent actions directly from Slack with interactive buttons.</li>
          <li>Approvals made in Slack are reflected instantly in Artemis.</li>
          <li>Configure which notifications each workspace receives.</li>
        </ul>
      </section>
    </div>
  )
}
