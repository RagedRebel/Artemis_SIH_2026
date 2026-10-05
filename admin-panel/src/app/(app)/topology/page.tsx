export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { TopologyMap } from '@/components/topology-map'
import { AppPageHeader } from '@/components/app-page-header'

async function getTopology() {
  try {
    const hosts = await db.query('SELECT ip, hostname, os, open_ports FROM network_hosts')
    const findings = await db.query(
      'SELECT affected_host, COUNT(*)::int as count, MAX(severity) as max_severity FROM findings GROUP BY affected_host'
    )

    const findingMap = new Map<string, { count: number; maxSeverity: string }>()
    for (const f of findings.rows) {
      findingMap.set(f.affected_host, { count: f.count, maxSeverity: f.max_severity })
    }

    const nodes = hosts.rows.map((h: Record<string, unknown>) => ({
      id: h.ip as string,
      label: (h.hostname as string) ?? (h.ip as string),
      os: h.os as string,
      ports: h.open_ports as unknown[],
      findingsCount: findingMap.get(h.ip as string)?.count ?? 0,
      maxSeverity: findingMap.get(h.ip as string)?.maxSeverity ?? 'clean',
    }))

    return { nodes }
  } catch {
    return { nodes: [] }
  }
}

export default async function TopologyPage() {
  const { nodes } = await getTopology()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Operations"
        title="Network topology"
        description="Discovered hosts from reconnaissance and findings correlated by address."
      />

      <div className="min-h-[500px] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:p-5">
        <TopologyMap nodes={nodes} />
      </div>
    </div>
  )
}
