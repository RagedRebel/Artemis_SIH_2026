export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { ApprovalCard } from '@/components/approval-card'
import { AppPageHeader, AppSectionLabel } from '@/components/app-page-header'

async function getApprovals() {
  try {
    const result = await db.query(
      "SELECT * FROM approval_requests ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC LIMIT 50"
    )
    return result.rows
  } catch {
    return []
  }
}

export default async function ApprovalsPage() {
  const approvals = await getApprovals()

  const pending = approvals.filter((a: Record<string, unknown>) => a.status === 'pending')
  const history = approvals.filter((a: Record<string, unknown>) => a.status !== 'pending')

  return (
    <div className="space-y-10">
      <AppPageHeader
        eyebrow="Operations"
        title="Approvals"
        description="Human-in-the-loop gate for high- and critical-risk agent actions before they run."
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AppSectionLabel>Pending</AppSectionLabel>
          {pending.length > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-red-800 ring-1 ring-red-200">
              {pending.length}
            </span>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending approvals.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((a: Record<string, unknown>) => (
              <li key={a.id as string} className="list-none">
                <ApprovalCard
                  id={a.id as string}
                  agentName={a.agent_name as string}
                  actionDescription={a.action_description as string}
                  command={a.command as string}
                  riskLevel={a.risk_level as string}
                  campaignId={a.campaign_id as string}
                  requestedAt={String(a.requested_at)}
                  status={a.status as string}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-4 border-t border-zinc-200/80 pt-10">
          <AppSectionLabel>History</AppSectionLabel>
          <ul className="space-y-4">
            {history.map((a: Record<string, unknown>) => (
              <li key={a.id as string} className="list-none">
                <ApprovalCard
                  id={a.id as string}
                  agentName={a.agent_name as string}
                  actionDescription={a.action_description as string}
                  command={a.command as string}
                  riskLevel={a.risk_level as string}
                  campaignId={a.campaign_id as string}
                  requestedAt={String(a.requested_at)}
                  status={a.status as string}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
