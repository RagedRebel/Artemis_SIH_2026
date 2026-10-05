export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { AppPageHeader, AppSectionLabel } from '@/components/app-page-header'
import { FindingReviewCard } from '@/components/finding-review-card'

const REVIEW_ROLES = new Set(['admin', 'analyst', 'pentester'])

interface FindingRow {
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

async function getReviewQueue(): Promise<{ pending: FindingRow[]; recent: FindingRow[] }> {
  try {
    const pendingRes = await db.query(
      `SELECT id, title, description, severity, cvss_score, affected_host, affected_service,
              evidence, verification_evidence, status, assigned_reviewer, created_at, campaign_id
         FROM findings
        WHERE status IN ('needs_manual_review', 'pending_verification')
        ORDER BY created_at DESC
        LIMIT 50`
    )
    const recentRes = await db.query(
      `SELECT id, title, description, severity, cvss_score, affected_host, affected_service,
              evidence, verification_evidence, status, assigned_reviewer, created_at, campaign_id
         FROM findings
        WHERE status IN ('verified', 'false_positive')
        ORDER BY COALESCE(reviewed_at, created_at) DESC
        LIMIT 20`
    )
    return { pending: pendingRes.rows, recent: recentRes.rows }
  } catch {
    return { pending: [], recent: [] }
  }
}

async function getPentesters() {
  try {
    const res = await db.query(
      `SELECT id, name, username, email FROM users WHERE role IN ('pentester','analyst','admin') ORDER BY name`
    )
    return res.rows
  } catch {
    return []
  }
}

export default async function FindingsReviewPage() {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user) {
    redirect('/login')
  }
  if (!role || !REVIEW_ROLES.has(role)) {
    return (
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Review"
          title="Findings review queue"
          description="Access denied — pentester, analyst, or admin role required."
        />
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Your account does not have permission to review findings.
        </p>
      </div>
    )
  }

  const [{ pending, recent }, reviewers] = await Promise.all([getReviewQueue(), getPentesters()])

  return (
    <div className="space-y-10">
      <AppPageHeader
        eyebrow="Review"
        title="Findings review queue"
        description="Confirm or reject red-team findings the agent could not verify automatically. Verified findings sync to JIRA and Slack."
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AppSectionLabel>Pending review</AppSectionLabel>
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-800 ring-1 ring-amber-200">
              {pending.length}
            </span>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">No findings waiting for review.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map(f => (
              <li key={f.id} className="list-none">
                <FindingReviewCard finding={f} reviewers={reviewers} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-4 border-t border-zinc-200/80 pt-10">
          <AppSectionLabel>Recently decided</AppSectionLabel>
          <ul className="space-y-4">
            {recent.map(f => (
              <li key={f.id} className="list-none">
                <FindingReviewCard finding={f} reviewers={reviewers} readOnly />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
