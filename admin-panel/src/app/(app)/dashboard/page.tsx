export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { SeverityPie } from '@/components/charts/severity-pie'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppPageHeader } from '@/components/app-page-header'
import { DashboardTopBar } from '@/components/dashboard/dashboard-top-bar'
import { ActivityFluxChart } from '@/components/dashboard/activity-flux-chart'
import { WorkingAgentsCard } from '@/components/dashboard/working-agents-card'
import { SystemWellnessLayout } from '@/components/dashboard/system-wellness-layout'
import { Swords, Crosshair, Flame, ShieldAlert, PieChart, Activity } from 'lucide-react'

async function getStats() {
  try {
    const [campaigns, findings, incidents, cveQueue, auditStats] = await Promise.all([
      db.query("SELECT status, COUNT(*)::int as count FROM campaigns GROUP BY status"),
      db.query("SELECT severity, COUNT(*)::int as count FROM findings GROUP BY severity"),
      db.query("SELECT status, COUNT(*)::int as count FROM incidents GROUP BY status"),
      db.query("SELECT status, COUNT(*)::int as count FROM cve_queue GROUP BY status"),
      db.query("SELECT time_bucket('1 hour', timestamp) AS bucket, COUNT(*)::int as count FROM audit_log WHERE timestamp >= NOW() - INTERVAL '24 hours' GROUP BY bucket ORDER BY bucket ASC")
    ])
    return {
      campaigns: campaigns.rows,
      findings: findings.rows,
      incidents: incidents.rows,
      cveQueue: cveQueue.rows,
      auditStats: auditStats.rows,
    }
  } catch {
    return {
      campaigns: [],
      findings: [
        { severity: 'critical', count: 1 },
        { severity: 'high', count: 1 },
        { severity: 'medium', count: 1 },
      ],
      incidents: [],
      cveQueue: [],
      auditStats: [],
    }
  }
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
  info: '#2563eb',
}

export default async function DashboardPage() {
  const [stats, session] = await Promise.all([getStats(), auth()])

  let dbImage = null
  if (session?.user?.id) {
    try {
       const res = await db.query('SELECT image_url FROM users WHERE id = $1', [session.user.id])
       dbImage = res.rows[0]?.image_url
    } catch(err) {}
  }

  const severityData = stats.findings.map((f: { severity: string; count: number }) => ({
    name: f.severity,
    value: f.count,
  }))

  const mockTimeline = Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setHours(d.getHours() - (23 - i))
    d.setMinutes(0, 0, 0)
    return {
      hour: `${d.getHours()}:00`,
      value: 0,
      timestamp: d.getTime()
    }
  })

  // Fill in active counts
  stats.auditStats.forEach((stat: { bucket: Date, count: number }) => {
    const statTime = new Date(stat.bucket).getTime()
    const match = mockTimeline.find(m => Math.abs(m.timestamp - statTime) < 1000 * 60 * 60)
    if (match) match.value = stat.count
  })

  const activeCampaigns = stats.campaigns
    .filter((c: { status: string }) => c.status === 'running')
    .reduce((acc: number, c: { count: number }) => acc + c.count, 0)

  const totalFindings = stats.findings.reduce((acc: number, f: { count: number }) => acc + f.count, 0)

  const openIncidents = stats.incidents
    .filter((i: { status: string }) => i.status === 'open' || i.status === 'investigating')
    .reduce((acc: number, i: { count: number }) => acc + i.count, 0)

  const cveQueued = stats.cveQueue
    .filter(
      (c: { status: string }) =>
        c.status === 'queued' || c.status === 'new' || c.status === 'assessing'
    )
    .reduce((acc: number, c: { count: number }) => acc + c.count, 0)

  const criticalCount =
    stats.findings.find((f: { severity: string }) => f.severity === 'critical')?.count ?? 0

  const totalEvents = stats.auditStats.reduce((acc: number, s: { count: number }) => acc + s.count, 0)
  const avgEventsPerHour = stats.auditStats.length > 0 ? totalEvents / stats.auditStats.length : 0

  const totalSev = severityData.reduce((s, x) => s + x.value, 0) || 1
  const breakdown = severityData.map(d => ({
    ...d,
    pct: Math.round((100 * d.value) / totalSev),
  }))

  const activityData = mockTimeline.slice(-10).map((m, i) => ({
    label: `${m.hour}`,
    value: m.value,
    highlight: i >= 7,
  }))

  const userName = session?.user?.name ?? 'Operator'
  const userEmail = session?.user?.email ?? 'Signed in'
  const userImage = dbImage ?? session?.user?.image ?? null

  return (
    <div className="flex flex-col gap-6">
      <DashboardTopBar userName={userName} userEmail={userEmail} userImage={userImage} />

      <AppPageHeader
        eyebrow="Operations"
        title="Security overview"
        description="Take control of exposure: campaigns, findings, and intelligence in one place."
        aside={
          <Button variant="secondary" asChild>
            <Link href="/campaigns">All campaigns</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <WorkingAgentsCard />
          <SystemWellnessLayout 
            totalEvents={totalEvents}
            avgEventsPerHour={avgEventsPerHour}
            criticalCount={criticalCount}
            totalFindings={totalFindings}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Primary insight card */}
        <Card className="relative overflow-hidden lg:col-span-5">
          <CardHeader className="pb-0 pt-6">
            <div className="flex items-start justify-between gap-4 pr-10">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="bg-zinc-50 p-2 rounded-full text-zinc-800">
                    <PieChart className="h-4 w-4" />
                  </div>
                  Finding mix
                </CardTitle>
                <CardDescription className="ml-10">By severity across the database</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900">{totalFindings}</p>
                <p className="text-xs font-medium text-zinc-500">Total Findings</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <SeverityPie data={severityData} />
            <div className="space-y-5">
              {breakdown.map(row => (
                <div key={row.name} className="space-y-2">
                  <div className="flex items-end justify-between leading-none">
                    <span className="text-[32px] font-medium tracking-tight text-zinc-900">
                      {row.pct}<span className="text-xl text-zinc-400 font-normal">%</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 tracking-tight pb-1 capitalize">
                      {row.name}
                      <span className="text-zinc-400 font-medium ml-1 text-xs">({row.value})</span>
                      <span 
                        className="h-2 w-2 rounded-full block ml-1" 
                        style={{ backgroundColor: SEVERITY_COLORS[row.name] ?? '#a1a1aa' }} 
                      />
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${row.pct}%`,
                        backgroundColor: SEVERITY_COLORS[row.name] ?? '#a1a1aa',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat
              icon={Swords}
              label="Active campaigns"
              value={activeCampaigns}
              sub="Running now"
              iconBg="bg-violet-100 text-violet-700"
            />
            <MiniStat
              icon={Crosshair}
              label="Findings"
              value={totalFindings}
              sub="Recorded"
              iconBg="bg-zinc-900 text-white"
            />
            <MiniStat
              icon={Flame}
              label="Open incidents"
              value={openIncidents}
              sub="Needs triage"
              iconBg="bg-orange-100 text-orange-700"
            />
          </div>

          <Card className="relative flex-1">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="bg-zinc-50 p-2 rounded-full text-zinc-800">
                    <Activity className="h-4 w-4" />
                  </div>
                  Agent Activity
                </CardTitle>
                <CardDescription className="ml-10">Audit events per hour (24h)</CardDescription>
              </div>
              <Button variant="secondary" size="sm" className="rounded-full" type="button">
                This week
              </Button>
            </CardHeader>
            <CardContent className="pb-6">
              <div className="mb-6 flex flex-wrap gap-6 border-b border-zinc-100 pb-4">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Pipeline load</p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-zinc-900">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary ring-1 ring-lime-700/25" />
                    CVE queue · {cveQueued}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Incidents</p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-zinc-900">
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                    Open · {openIncidents}
                  </p>
                </div>
              </div>
              <ActivityFluxChart data={activityData} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-100 text-lime-800">
                  <ShieldAlert className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">CVE intelligence</p>
                  <p className="text-sm text-zinc-500">{cveQueued} items in new / assessing / queued</p>
                </div>
              </div>
              <Button variant="lime" asChild>
                <Link href="/cve">Open board</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
}: {
  icon: LucideIcon
  label: string
  value: number
  sub: string
  iconBg: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-6">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconBg)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-900">{value}</p>
        <p className="mt-1 text-xs text-zinc-500">{sub}</p>
      </CardContent>
    </Card>
  )
}
