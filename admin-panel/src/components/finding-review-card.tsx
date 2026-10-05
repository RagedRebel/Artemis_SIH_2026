'use client'

import { SeverityBadge } from './severity-badge'
import { cn, formatDate } from '@/lib/utils'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Finding {
  id: string
  title: string
  description: string
  severity: string
  cvss_score: number | null
  affected_host: string | null
  affected_service: string | null
  evidence: unknown
  verification_evidence: unknown
  status: string
  assigned_reviewer: string | null
  created_at: string
  campaign_id: string | null
}

interface Reviewer {
  id: string
  name: string
  username: string
  email: string
}

interface Props {
  finding: Finding
  reviewers: Reviewer[]
  readOnly?: boolean
}

export function FindingReviewCard({ finding, reviewers, readOnly }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [assignee, setAssignee] = useState(finding.assigned_reviewer ?? '')
  const [status, setStatus] = useState(finding.status)
  const [error, setError] = useState<string | null>(null)

  async function call(path: string, payload: Record<string, unknown>, newStatus?: string) {
    setError(null)
    setBusy(path)
    try {
      const res = await fetch(`/api/findings/${finding.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Action failed.')
        return
      }
      if (newStatus) setStatus(newStatus)
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setBusy(null)
    }
  }

  const verdictLabel = {
    verified: 'Verified',
    false_positive: 'False positive',
    pending_verification: 'Pending',
    needs_manual_review: 'Needs review',
  }[status] ?? status

  const verdictTone =
    status === 'verified'
      ? 'text-emerald-700'
      : status === 'false_positive'
      ? 'text-zinc-500'
      : 'text-amber-700'

  const evidenceJson = JSON.stringify(finding.evidence ?? {}, null, 2)
  const verificationJson = JSON.stringify(finding.verification_evidence ?? {}, null, 2)

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-zinc-900">{finding.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {finding.affected_service && (
              <span className="mr-2 font-mono font-medium text-zinc-700">{finding.affected_service}</span>
            )}
            {finding.affected_host && <span>on <span className="font-mono text-zinc-700">{finding.affected_host}</span></span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          {finding.cvss_score != null && (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-zinc-700">
              CVSS {Number(finding.cvss_score).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {finding.description && (
        <p className="text-xs leading-relaxed text-zinc-600 whitespace-pre-wrap">{finding.description}</p>
      )}

      {evidenceJson !== '{}' && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-700">Evidence</summary>
          <pre className="max-h-64 overflow-auto border-t border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800">
            {evidenceJson}
          </pre>
        </details>
      )}

      {verificationJson !== '{}' && (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-700">Agent verification attempt</summary>
          <pre className="max-h-64 overflow-auto border-t border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800">
            {verificationJson}
          </pre>
        </details>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>{formatDate(finding.created_at)}</span>
          <span className={cn('font-bold uppercase tracking-wide', verdictTone)}>{verdictLabel}</span>
        </div>

        {!readOnly && (status === 'pending_verification' || status === 'needs_manual_review') && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            >
              <option value="">Unassigned</option>
              {reviewers.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.username || r.email}</option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => call('assign', { reviewerId: assignee || null })}
            >
              Assign
            </Button>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Review notes (optional)"
              className="w-48 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs placeholder:text-zinc-400"
            />
            <Button
              type="button"
              size="sm"
              variant="lime"
              disabled={busy !== null}
              onClick={() => call('verify', { notes }, 'verified')}
            >
              Confirm TP
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="border-red-200 text-red-800 hover:border-red-300 hover:bg-red-50"
              disabled={busy !== null}
              onClick={() => call('false-positive', { notes }, 'false_positive')}
            >
              Mark FP
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
