'use client'

import { SeverityBadge } from './severity-badge'
import { cn, formatDate } from '@/lib/utils'

interface AlertRow {
  id: string
  timestamp: string
  agentName: string
  ruleDescription: string
  severity: number
  srcIp?: string
  aiTriage?: string
  ruleMitre?: { id: string; technique: string }[]
}

function wazuhSeverityToLabel(level: number): string {
  if (level >= 12) return 'critical'
  if (level >= 8) return 'high'
  if (level >= 5) return 'medium'
  if (level >= 3) return 'low'
  return 'info'
}

export function AlertConsole({ alerts }: { alerts: AlertRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Source IP</th>
              <th className="px-4 py-3 font-medium">MITRE</th>
              <th className="px-4 py-3 font-medium">AI triage</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map(alert => (
              <tr
                key={alert.id}
                className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80"
              >
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-zinc-500">
                  {formatDate(alert.timestamp)}
                </td>
                <td className="px-4 py-2.5 text-sm text-zinc-800">{alert.agentName}</td>
                <td className="max-w-xs truncate px-4 py-2.5 text-sm text-zinc-700">{alert.ruleDescription}</td>
                <td className="px-4 py-2.5">
                  <SeverityBadge severity={wazuhSeverityToLabel(alert.severity)} />
                </td>
                <td className="px-4 py-2.5 font-mono text-sm text-zinc-800">{alert.srcIp ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {alert.ruleMitre?.map(m => (
                    <span
                      key={m.id}
                      className="mr-1 inline-block rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900 ring-1 ring-violet-200"
                    >
                      {m.id}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2.5">
                  {alert.aiTriage && (
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1',
                        alert.aiTriage === 'true_positive' && 'bg-red-50 text-red-900 ring-red-200',
                        alert.aiTriage === 'false_positive' && 'bg-emerald-50 text-emerald-900 ring-emerald-200',
                        alert.aiTriage !== 'true_positive' &&
                          alert.aiTriage !== 'false_positive' &&
                          'bg-zinc-100 text-zinc-700 ring-zinc-200'
                      )}
                    >
                      {alert.aiTriage.replace('_', ' ')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
