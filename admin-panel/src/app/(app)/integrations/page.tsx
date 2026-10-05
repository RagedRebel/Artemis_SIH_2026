export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/lib/db'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent } from '@/components/ui/card'

async function getIntegrationStats() {
  try {
    const [jira, slack] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS c FROM jira_connections WHERE is_active = true`),
      db.query(`SELECT COUNT(*)::int AS c FROM slack_connections WHERE is_active = true`),
    ])
    return {
      jiraCount: jira.rows[0]?.c ?? 0,
      slackCount: slack.rows[0]?.c ?? 0,
    }
  } catch {
    return { jiraCount: 0, slackCount: 0 }
  }
}

const INTEGRATIONS = [
  {
    id: 'jira',
    name: 'Jira',
    description:
      'Automatically create Jira tickets for incidents and keep status in sync bidirectionally.',
    href: '/integrations/jira',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84H11.53Zm-4.67 4.65c0 2.4 1.97 4.35 4.35 4.36h1.78v1.7c0 2.4 1.95 4.35 4.35 4.35V7.5a.84.84 0 0 0-.84-.84H6.86ZM2.19 11.31c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7C8.32 19.76 10.27 21.71 12.67 21.71V12.15a.84.84 0 0 0-.84-.84H2.19Z" />
      </svg>
    ),
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    countKey: 'jiraCount' as const,
  },
  {
    id: 'slack',
    name: 'Slack',
    description:
      'Receive incident notifications and approve agent actions directly from Slack.',
    href: '/integrations/slack',
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52Zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313ZM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834Zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312ZM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834Zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312ZM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52Zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315Z" />
      </svg>
    ),
    color: 'text-[#E01E5A]',
    bgColor: 'bg-pink-50',
    countKey: 'slackCount' as const,
  },
]

export default async function IntegrationsPage() {
  const stats = await getIntegrationStats()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Connect external services to streamline incident management and team collaboration."
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {INTEGRATIONS.map((integration) => {
          const count = stats[integration.countKey]
          const connected = count > 0

          return (
            <Link key={integration.id} href={integration.href} className="group">
              <Card className="h-full transition-shadow duration-200 group-hover:shadow-md">
                <CardContent className="flex flex-col gap-5 p-6">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-xl ${integration.bgColor} ${integration.color}`}
                    >
                      {integration.icon}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        connected
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                      />
                      {connected
                        ? `${count} connected`
                        : 'Not connected'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {integration.name}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                      {integration.description}
                    </p>
                  </div>

                  <div className="mt-auto pt-2">
                    <span className="text-sm font-medium text-zinc-900 transition-colors group-hover:text-primary">
                      Configure &rarr;
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
