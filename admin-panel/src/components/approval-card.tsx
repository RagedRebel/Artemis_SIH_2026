'use client'

import { SeverityBadge } from './severity-badge'
import { cn, formatDate } from '@/lib/utils'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ApprovalCardProps {
  id: string
  agentName: string
  actionDescription: string
  command: string
  riskLevel: string
  campaignId: string
  requestedAt: string
  status: string
}

export function ApprovalCard({
  id,
  agentName,
  actionDescription,
  command,
  riskLevel,
  campaignId: _campaignId,
  requestedAt,
  status,
}: ApprovalCardProps) {
  const [responding, setResponding] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(status)

  async function handleResponse(decision: 'approve' | 'deny') {
    setResponding(true)
    try {
      await fetch(`/api/approvals/${id}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `${decision}d via admin panel` }),
      })
      setCurrentStatus(decision === 'approve' ? 'approved' : 'denied')
    } catch {
      // silent
    } finally {
      setResponding(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-zinc-900">{actionDescription}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Agent{' '}
            <span className="font-mono font-medium text-zinc-700">{agentName}</span>
          </p>
        </div>
        <SeverityBadge severity={riskLevel} />
      </div>

      <pre className="max-h-40 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-800">
        {command}
      </pre>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">{formatDate(requestedAt)}</span>

        {currentStatus === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="lime" size="sm" disabled={responding} onClick={() => handleResponse('approve')}>
              Approve
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="border-red-200 text-red-800 hover:border-red-300 hover:bg-red-50"
              disabled={responding}
              onClick={() => handleResponse('deny')}
            >
              Deny
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              'text-xs font-bold uppercase tracking-wide',
              currentStatus === 'approved' ? 'text-emerald-700' : 'text-red-700'
            )}
          >
            {currentStatus}
          </span>
        )}
      </div>
    </div>
  )
}
