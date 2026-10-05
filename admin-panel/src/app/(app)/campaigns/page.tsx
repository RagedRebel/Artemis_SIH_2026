export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppPageHeader } from '@/components/app-page-header'
import { CampaignCard, type CampaignRow } from '@/components/campaign-card'
import { AutoRefresh } from '@/components/auto-refresh'

async function getCampaigns(): Promise<CampaignRow[]> {
  try {
    const result = await db.query(
      'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50'
    )
    return result.rows as CampaignRow[]
  } catch {
    return []
  }
}

type PageProps = { searchParams: Promise<{ queued?: string }> }

export default async function CampaignsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const showQueuedNotice = sp.queued === '1'
  const campaigns = await getCampaigns()

  return (
    <div className="space-y-8">
      <AutoRefresh interval={3000} />
      <AppPageHeader
        eyebrow="Operations"
        title="Campaigns"
        description="Assessment runs, scope, and status — open a card for live feed, findings, and agent reports."
        aside={
          <Button variant="lime" asChild className="shrink-0">
            <Link href="/campaigns/new" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              New campaign
            </Link>
          </Button>
        }
      />

      {showQueuedNotice ? (
        <p className="rounded-xl border border-lime-200/90 bg-lime-50/90 px-4 py-3 text-sm text-lime-950">
          Campaign request queued. The orchestrator creates the database row when it starts the job — refresh shortly if
          you do not see it yet.
        </p>
      ) : null}

      {campaigns.length === 0 ? (
        <Card className="border-dashed border-zinc-300/80 bg-white/80">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-base font-medium text-zinc-700">No campaigns yet</p>
            <p className="max-w-sm text-sm text-zinc-500">
              {showQueuedNotice
                ? 'If you just submitted a campaign, wait for the handler to create it, then refresh this page.'
                : 'Launch your first assessment to queue work for red-team agents and the orchestrator.'}
            </p>
            <Button variant="secondary" asChild className="mt-2">
              <Link href="/campaigns/new">Create campaign</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map(c => (
            <li key={c.id} className="min-h-0 list-none">
              <CampaignCard campaign={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
