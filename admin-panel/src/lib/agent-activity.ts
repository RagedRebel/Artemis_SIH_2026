import { db } from '@/lib/db'

export type AgentLaneStatus = {
  id: string
  label: string
  state: 'busy' | 'idle'
  lastTool?: string
  lastAt?: string
}

const LANES: { id: string; label: string; agentNames: string[] }[] = [
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    agentNames: ['orchestrator_agent', 'orchestrator_runner', 'campaign_handler'],
  },
  {
    id: 'red_team',
    label: 'Red team',
    agentNames: ['red_team_agent', 'red_team_runner'],
  },
  {
    id: 'blue_team',
    label: 'Blue team',
    agentNames: ['blue_team_agent', 'blue_team_runner'],
  },
  {
    id: 'cve_intel',
    label: 'CVE intelligence',
    agentNames: ['cve_intel_agent', 'cve_intel_scheduler'],
  },
]

const RECENT_MS = 3 * 60 * 1000

export async function getAgentLaneStatus(): Promise<AgentLaneStatus[]> {
  type Row = { agent_name: string; tool_name: string; timestamp: Date | string }
  let rows: Row[] = []
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (agent_name) agent_name, tool_name, timestamp
       FROM audit_log
       WHERE timestamp > NOW() - INTERVAL '5 minutes'
       ORDER BY agent_name, timestamp DESC`
    )
    rows = result.rows as Row[]
  } catch {
    rows = []
  }

  const now = Date.now()

  return LANES.map(lane => {
    const hits = rows.filter(r => lane.agentNames.includes(r.agent_name))
    if (hits.length === 0) {
      return { id: lane.id, label: lane.label, state: 'idle' as const }
    }
    const latest = hits.reduce((a, b) => {
      const ta = new Date(a.timestamp).getTime()
      const tb = new Date(b.timestamp).getTime()
      return tb >= ta ? b : a
    })
    const t = new Date(latest.timestamp).getTime()
    const busy = now - t <= RECENT_MS
    return {
      id: lane.id,
      label: lane.label,
      state: busy ? ('busy' as const) : ('idle' as const),
      lastTool: latest.tool_name,
      lastAt: new Date(latest.timestamp).toISOString(),
    }
  })
}
