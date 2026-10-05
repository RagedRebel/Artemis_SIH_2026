'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AuditInputSummary } from '@/components/audit-input-summary'
import { AuditOutputCell } from '@/components/audit-output-cell'
import { ChevronRight } from 'lucide-react'
import { auditToolTitle, formatAuditAgentName } from '@/lib/audit-tool-labels'
import { useAuditStream } from '@/components/hooks/use-audit-stream'

export function ClientAuditList({ initialRows }: { initialRows: Record<string, unknown>[] }) {
  const logs = useAuditStream(initialRows)

  if (logs.length === 0) {
    return (
      <Card className="border-dashed border-zinc-300/90 bg-white/90">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-zinc-700">No audit entries yet</p>
          <p className="max-w-md text-sm text-zinc-500">
            When agents run tools, rows appear here with inputs, outputs, and timing.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ul className="space-y-4">
      {logs.map((log) => {
        const id = log.id as string
        const campaignId = log.campaign_id as string | null | undefined
        const toolName = String(log.tool_name ?? '')
        const duration = Number(log.duration_ms ?? 0)

        // Ensure robust date and time formatting
        const formattedDateTime = new Date(String(log.timestamp ?? '')).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'medium'
        })

        return (
          <li key={id} className="list-none">
            <Card className="overflow-hidden border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <CardHeader className="border-b border-zinc-100 bg-linear-to-b from-zinc-50/95 to-white py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-lime-200/80 bg-lime-50/90 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-900">
                        {formatAuditAgentName(String(log.agent_name ?? ''))}
                      </span>
                      <span
                        className="hidden h-1 w-1 rounded-full bg-zinc-300 sm:inline"
                        aria-hidden
                      />
                      <CardTitle className="text-base font-semibold leading-snug text-zinc-900">
                        {auditToolTitle(toolName)}
                      </CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span className="font-mono tabular-nums bg-white px-2 py-0.5 rounded border border-zinc-200 shadow-sm text-zinc-700">
                        <span suppressHydrationWarning>{formattedDateTime}</span>
                      </span>
                      <span className="text-zinc-300">·</span>
                      <span className="tabular-nums">{duration} ms</span>
                      {toolName !== auditToolTitle(toolName) ? (
                        <>
                          <span className="text-zinc-300">·</span>
                          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                            {toolName}
                          </code>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {campaignId ? (
                      <Link
                        href={`/campaigns/${campaignId}`}
                        className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        Open campaign
                        <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
                      </Link>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Global
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className={`grid gap-5 p-5 ${toolName !== 'close_campaign' ? 'lg:grid-cols-2 lg:gap-6' : ''}`}>
                {toolName !== 'close_campaign' && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                      What was requested
                    </p>
                    <AuditInputSummary toolName={toolName} input={log.input as Record<string, unknown>} />
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Output</p>
                  <AuditOutputCell
                    toolName={toolName}
                    output={log.output}
                    input={log.input}
                    presentation="campaign"
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
