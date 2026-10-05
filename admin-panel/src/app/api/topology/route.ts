import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const hosts = await db.query('SELECT * FROM network_hosts ORDER BY discovered_at DESC')

  const findings = await db.query(
    'SELECT affected_host, COUNT(*)::int as count FROM findings GROUP BY affected_host'
  )

  const findingMap = new Map<string, number>()
  for (const f of findings.rows) {
    findingMap.set(f.affected_host, f.count)
  }

  const nodes = hosts.rows.map((h: Record<string, unknown>) => ({
    id: h.ip,
    hostname: h.hostname,
    os: h.os,
    openPorts: h.open_ports,
    findingsCount: findingMap.get(h.ip as string) ?? 0,
    lastSeen: h.last_seen,
  }))

  return NextResponse.json({ nodes, edges: [] })
}
