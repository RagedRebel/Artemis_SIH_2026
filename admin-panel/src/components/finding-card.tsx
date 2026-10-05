import { SeverityBadge } from './severity-badge'
import { formatDate } from '@/lib/utils'

interface FindingCardProps {
  id: string
  title: string
  affectedHost: string
  affectedService: string
  severity: string
  cvssScore: number
  cveId?: string
  createdAt: string
  status: string
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_verification': return 'pending verification'
    case 'needs_manual_review': return 'needs review'
    case 'false_positive': return 'false positive'
    default: return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'verified':
    case 'remediated':
      return 'text-emerald-700'
    case 'open':
    case 'pending_verification':
    case 'needs_manual_review':
      return 'text-amber-700'
    case 'false_positive':
      return 'text-zinc-400 line-through'
    default:
      return 'text-zinc-600'
  }
}

export function FindingCard({
  title, affectedHost, affectedService, severity, cvssScore, cveId, createdAt, status,
}: FindingCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {affectedHost} &middot; {affectedService}
          </p>
        </div>
        <SeverityBadge severity={severity} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="font-mono font-medium text-zinc-700">CVSS {cvssScore.toFixed(1)}</span>
        {cveId && (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] text-zinc-800">
            {cveId}
          </span>
        )}
        <span className={'font-medium ' + statusClass(status)}>{statusLabel(status)}</span>
        <span className="ml-auto tabular-nums text-zinc-400">{formatDate(createdAt)}</span>
      </div>
    </div>
  )
}
