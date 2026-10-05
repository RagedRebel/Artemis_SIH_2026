export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { AuditInputSummary } from '@/components/audit-input-summary'
import { AuditOutputCell } from '@/components/audit-output-cell'
import { ClientAuditList } from '@/components/client-audit-list'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { auditToolTitle, formatAuditAgentName } from '@/lib/audit-tool-labels'
import { ChevronRight, Clock, Layers, Users } from 'lucide-react'

async function getAuditLog() {
  try {
    const result = await db.query('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100')
    return result.rows as Record<string, unknown>[]
  } catch {
    return []
  }
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Layers
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <Card className="border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <CardContent className="flex gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AuditPage() {
  const logs = await getAuditLog()

  const agentKeys = new Set(logs.map(l => String(l.agent_name ?? '')).filter(Boolean))
  const latestTs = logs[0]?.timestamp as string | undefined
  const oldestTs = logs.length > 0 ? (logs[logs.length - 1]?.timestamp as string | undefined) : undefined

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Operations"
        title="Audit log"
        description="Immutable record of agent tool calls and orchestrator decisions across campaigns."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={Layers} label="Entries" value={logs.length} hint="Most recent 100 rows" />
        <StatTile icon={Users} label="Agents" value={agentKeys.size} hint="Distinct agent_name in this view" />
        <StatTile
          icon={Clock}
          label="Latest event"
          value={latestTs ? formatDate(latestTs) : '—'}
          hint={oldestTs && logs.length > 1 ? `Oldest in view: ${formatDate(oldestTs)}` : undefined}
        />
      </div>

      <ClientAuditList initialRows={logs} />
    </div>
  )
}
