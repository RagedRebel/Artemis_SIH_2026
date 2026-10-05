export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { SeverityBadge } from '@/components/severity-badge'
import { AppPageHeader } from '@/components/app-page-header'
import { cn } from '@/lib/utils'

async function getCVEQueue() {
  try {
    const result = await db.query('SELECT * FROM cve_queue ORDER BY cvss_score DESC LIMIT 50')
    return result.rows
  } catch {
    return []
  }
}

const statusStyles: Record<string, string> = {
  new: 'bg-sky-50 text-sky-900 ring-1 ring-sky-200',
  assessing: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  queued: 'bg-violet-50 text-violet-900 ring-1 ring-violet-200',
  testing: 'bg-orange-50 text-orange-900 ring-1 ring-orange-200',
  tested: 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
  not_applicable: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
}

export default async function CVEPage() {
  const cveQueue = await getCVEQueue()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Intelligence"
        title="CVE intelligence"
        description="Pipeline for new CVEs, PoC signals, applicability, and test status from the intel agent."
      />

      <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">CVE ID</th>
                <th className="px-4 py-3 font-medium">CVSS</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">PoC</th>
                <th className="px-4 py-3 font-medium">Hosts</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {cveQueue.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No CVEs in queue. The CVE intel agent refreshes on its schedule.
                  </td>
                </tr>
              )}
              {cveQueue.map((cve: Record<string, unknown>) => (
                <tr
                  key={cve.cve_id as string}
                  className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80"
                >
                  <td className="px-4 py-3">
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${cve.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-semibold text-zinc-900 underline-offset-2 hover:text-lime-800 hover:underline"
                    >
                      {cve.cve_id as string}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge
                        severity={
                          Number(cve.cvss_score) >= 9
                            ? 'critical'
                            : Number(cve.cvss_score) >= 7
                              ? 'high'
                              : 'medium'
                        }
                      />
                      <span className="font-mono text-sm tabular-nums text-zinc-800">
                        {Number(cve.cvss_score).toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-zinc-700">{cve.description as string}</td>
                  <td className="px-4 py-3">
                    {cve.poc_url ? (
                      <a
                        href={cve.poc_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
                      >
                        {cve.poc_source as string} {cve.poc_stars ? `(${cve.poc_stars}★)` : ''}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-zinc-800">
                    {(cve.applicable_hosts as string[])?.length ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize',
                        statusStyles[cve.status as string] ?? 'bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200'
                      )}
                    >
                      {(cve.status as string).replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
