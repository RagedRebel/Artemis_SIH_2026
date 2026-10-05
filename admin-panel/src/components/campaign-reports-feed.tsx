'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuditOutputCell } from '@/components/audit-output-cell'
import { auditToolTitle, formatAuditAgentName } from '@/lib/audit-tool-labels'
import { formatDate } from '@/lib/utils'
import { useAuditStream } from '@/components/hooks/use-audit-stream'

interface CampaignReportsFeedProps {
  campaignId: string
  initialRows: Record<string, unknown>[]
}

export function CampaignReportsFeed({ campaignId, initialRows }: CampaignReportsFeedProps) {
  const reportRows = useAuditStream(initialRows, campaignId)

  return (
    <section id="campaign-reports" className="scroll-mt-28 space-y-5">
      <div className="flex flex-col gap-1 border-b border-zinc-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Agent reports</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Tool rows shown here have this campaign&apos;s ID. Orchestrator actions always link; sub-agent scans
            (nmap, SQLMap, etc.) link when the handler has the active campaign set or the tool passes campaignId.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-700">
          {reportRows.length} entries
        </span>
      </div>

      {reportRows.length === 0 ? (
        <Card className="border-dashed border-zinc-300/90 bg-white/80">
          <CardContent className="py-12 text-center text-sm text-zinc-500">
            No scoped audit entries yet. After{' '}
            <code className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-800">
              create_campaign
            </code>{' '}
            runs, linked tool calls show here.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-5">
          {reportRows.map((row) => (
            <li key={String(row.id)} className="list-none">
              <Card className="overflow-hidden border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <CardHeader className="border-b border-zinc-100 bg-zinc-50/90 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base text-zinc-900">
                        {auditToolTitle(String(row.tool_name))}
                      </CardTitle>
                    </div>
                    {/* Updated to show both date and time securely formatted */}
                    <span className="text-xs tabular-nums text-zinc-600 font-medium bg-white px-2 py-0.5 rounded border border-zinc-200">
                      {new Date(String(row.timestamp)).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'medium'
                      })}
                      <span className="text-zinc-400 font-normal ml-2 text-[10px]">
                        · {Number(row.duration_ms)}ms
                      </span>
                    </span>
                  </div>
                  <CardDescription className="text-xs font-medium text-zinc-600">
                    {formatAuditAgentName(String(row.agent_name))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-5">
                  <AuditOutputCell
                    toolName={String(row.tool_name)}
                    output={row.output}
                    input={row.input}
                    presentation="campaign"
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
