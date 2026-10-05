import type { ReactNode } from 'react'
import { db } from '@/lib/db'

import { FindingCard } from '@/components/finding-card'
import { formatDate } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Crosshair,
  Gauge,

  User,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuditOutputCell } from '@/components/audit-output-cell'
import { CampaignStatusBadge, CampaignMaxRiskBadge } from '@/components/campaign-card'
import { cn } from '@/lib/utils'
import { auditToolTitle, formatAuditAgentName } from '@/lib/audit-tool-labels'
import { CampaignReportsFeed } from '@/components/campaign-reports-feed'
import { AutoRefresh } from '@/components/auto-refresh'
import { RunningTimer } from '@/components/running-timer'
import { AbortCampaignButton } from '@/components/abort-campaign-button'

async function getCampaign(id: string) {
  try {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1', [id])
    return result.rows[0] ?? null
  } catch {
    return null
  }
}

async function getFindings(campaignId: string) {
  try {
    const result = await db.query(
      'SELECT * FROM findings WHERE campaign_id = $1 ORDER BY cvss_score DESC',
      [campaignId]
    )
    return result.rows
  } catch {
    return []
  }
}

async function getCampaignReports(campaignId: string) {
  try {
    const result = await db.query(
      `SELECT id, timestamp, agent_name, tool_name, input, output, duration_ms
       FROM audit_log
       WHERE campaign_id = $1
       ORDER BY timestamp DESC
       LIMIT 200`,
      [campaignId]
    )
    return result.rows as Record<string, unknown>[]
  } catch {
    return []
  }
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
}: {
  icon: typeof Crosshair
  label: string
  value: ReactNode
  sub?: string
  iconBg: string
}) {
  return (
    <Card className="overflow-hidden border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <CardContent className="p-5 pt-5">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', iconBg)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()

  const [findings, reports] = await Promise.all([getFindings(id), getCampaignReports(id)])
  const reportRows = reports

  const scope = (campaign.target_scope as string[]) ?? []
  const createdBy = String(campaign.created_by ?? '—')
  const whenStarted = campaign.started_at ?? campaign.created_at

  // We want to auto-refresh only if campaign is running or queued
  const isPending = campaign.status === 'queued' || campaign.status === 'running'

  return (
    <div className="space-y-10 pb-12">
      {isPending && <AutoRefresh interval={10000} />}
      <div className="space-y-5">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          All campaigns
        </Link>

        <nav
          className="sticky top-0 z-20 -mx-5 flex flex-wrap items-center gap-1 border-b border-zinc-200/90 bg-[#e8e8e8]/92 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:px-8"
          aria-label="Campaign sections"
        >
          {[
            ['#campaign-overview', 'Overview'],
            ['#campaign-findings', 'Findings'],
            ['#campaign-reports', 'Agent reports'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/80 hover:text-zinc-900"
            >
              {label}
            </a>
          ))}
          <Link
            href="/audit"
            className="ml-auto text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            Full audit log →
          </Link>
        </nav>
      </div>

      <header id="campaign-overview" className="scroll-mt-28 space-y-8 border-b border-zinc-200/80 pb-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-800">
              <span
                className="size-2 shrink-0 rounded-full bg-lime-500 shadow-[0_0_0_3px_rgba(163,230,53,0.45)]"
                aria-hidden
              />
              Campaign
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">{campaign.name as string}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                <span className="font-mono text-zinc-800">{createdBy}</span>
              </span>
              <span className="text-zinc-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                {campaign.started_at ? 'Started' : 'Created'}{' '}
                <span className="font-medium text-zinc-800">{formatDate(whenStarted as string)}</span>
              </span>
            </div>
            <div className="max-w-3xl rounded-xl border border-zinc-200/80 bg-white/60 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Target scope</p>
              <p className="mt-1.5 font-mono text-sm leading-relaxed text-zinc-700">{scope.join(', ') || '—'}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CampaignStatusBadge status={String(campaign.status)} />
            <CampaignMaxRiskBadge level={String(campaign.max_risk_level)} />
            {campaign.status === 'running' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300/80 bg-primary/25 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-900">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-600" />
                  </span>
                  Live
                </span>
                <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                  <RunningTimer startedAt={campaign.started_at as string ?? campaign.created_at as string} />
                </div>
              </div>
            )}
            {(campaign.status === 'running' || campaign.status === 'queued') && (
              <AbortCampaignButton campaignId={id} />
            )}
          </div>
        </div>

        {campaign.error_message && (campaign.status === 'failed' || campaign.status === 'aborted') && (
          <div className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            campaign.status === 'aborted'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-red-200 bg-red-50 text-red-800'
          )}>
            <p className="font-semibold">{campaign.status === 'aborted' ? 'Campaign aborted' : 'Campaign failed'}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{campaign.error_message as string}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <OverviewStat
            icon={Crosshair}
            label="Findings"
            value={campaign.findings_count as number}
            sub="Recorded for this campaign"
            iconBg="bg-violet-100 text-violet-700"
          />
          <OverviewStat
            icon={Gauge}
            label="Max risk"
            value={<span className="capitalize">{String(campaign.max_risk_level)}</span>}
            sub="Approved ceiling"
            iconBg="bg-orange-100 text-orange-800"
          />
          <OverviewStat
            icon={Activity}
            label="Status"
            value={<span className="capitalize">{String(campaign.status)}</span>}
            sub="Pipeline state"
            iconBg="bg-zinc-900 text-white"
          />
        </div>
      </header>



      <section id="campaign-findings" className="scroll-mt-28 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200/80 pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Findings</h2>
            <p className="mt-1 text-sm text-zinc-500">Ranked by CVSS for this campaign.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-700">
            {findings.length} total
          </span>
        </div>
        <div className="space-y-4">
          {findings.length === 0 && (
            <Card className="border-dashed border-zinc-300/90 bg-white/80">
              <CardContent className="py-12 text-center text-sm text-zinc-500">
                No findings recorded for this campaign yet.
              </CardContent>
            </Card>
          )}
          {findings.map((f: Record<string, unknown>) => (
            <FindingCard
              key={f.id as string}
              id={f.id as string}
              title={f.title as string}
              affectedHost={f.affected_host as string}
              affectedService={f.affected_service as string}
              severity={f.severity as string}
              cvssScore={Number(f.cvss_score)}
              cveId={f.cve_id as string | undefined}
              createdAt={String(f.created_at)}
              status={f.status as string}
            />
          ))}
        </div>
      </section>

      <CampaignReportsFeed campaignId={id} initialRows={reportRows} />
    </div>
  )
}
