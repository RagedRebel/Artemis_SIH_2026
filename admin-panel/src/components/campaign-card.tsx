import Link from 'next/link'
import { ChevronRight, Crosshair, User, Calendar, Radar } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate, severityColor } from '@/lib/utils'

export type CampaignRow = {
  id: string
  name: string
  target_scope: string[]
  status: string
  max_risk_level: string
  created_by: string
  started_at: string | Date | null
  ended_at: string | Date | null
  findings_count: number
  created_at: string | Date
}

const STATUS_BADGE: Record<string, string> = {
  running: 'border border-lime-200 bg-lime-100 text-lime-950',
  queued: 'border border-zinc-200 bg-zinc-100 text-zinc-800',
  completed: 'border border-emerald-200 bg-emerald-50 text-emerald-900',
  failed: 'border border-red-200 bg-red-50 text-red-800',
  paused: 'border border-amber-200 bg-amber-50 text-amber-900',
  aborted: 'border border-orange-200 bg-orange-50 text-orange-800',
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? 'border border-zinc-200 bg-zinc-100 text-zinc-700'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        cls
      )}
    >
      {status}
    </span>
  )
}

export function CampaignMaxRiskBadge({ level }: { level: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        severityColor(level)
      )}
    >
      Max · {level}
    </span>
  )
}

export function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const scope = Array.isArray(campaign.target_scope) ? campaign.target_scope : []
  const n = scope.length
  const scopeLine =
    n === 0
      ? '—'
      : n <= 2
        ? scope.join(', ')
        : `${scope.slice(0, 2).join(', ')} +${n - 2} more`

  const when = campaign.started_at ?? campaign.created_at

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group block h-full min-h-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8e8e8]"
    >
      <Card className="flex h-full min-h-[280px] flex-col border-zinc-200/90 bg-white transition-all duration-200 hover:border-zinc-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-zinc-900 transition-colors group-hover:text-zinc-950 sm:text-[17px]">
                {campaign.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <Radar className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                <span>
                  {n} target{n === 1 ? '' : 's'}
                </span>
              </CardDescription>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-zinc-50 text-zinc-400 transition-all group-hover:border-zinc-300 group-hover:bg-white group-hover:text-zinc-600">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <CampaignMaxRiskBadge level={campaign.max_risk_level} />
            {campaign.status === 'running' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-lime-300/80 bg-primary/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-600" />
                </span>
                Live
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between gap-5 pt-0">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Scope</p>
              <p className="mt-1.5 line-clamp-2 font-mono text-[12px] leading-relaxed text-zinc-600">{scopeLine}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <Crosshair className="h-3 w-3" aria-hidden />
                  Findings
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-zinc-900">{campaign.findings_count}</p>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <Calendar className="h-3 w-3" aria-hidden />
                  {campaign.started_at ? 'Started' : 'Created'}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-tight text-zinc-700">{formatDate(when)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-zinc-100 pt-4 text-[11px] text-zinc-500">
            <User className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            <span className="truncate">
              <span className="font-medium text-zinc-600">Owner</span>{' '}
              <span className="font-mono text-zinc-700">{campaign.created_by}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
