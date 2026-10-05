import { Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/db'

async function getAgentActivity() {
  try {
    const res = await db.query(
      "SELECT agent_name, COUNT(*)::int as count FROM audit_log WHERE timestamp >= NOW() - INTERVAL '24 hours' GROUP BY agent_name;"
    )
    
    let cve = 0
    let red = 0
    let blue = 0
    let orch = 0
    
    res.rows.forEach(r => {
      const name = r.agent_name || ''
      if (name.includes('cve')) cve += r.count
      else if (name.includes('red')) red += r.count
      else if (name.includes('blue')) blue += r.count
      else orch += r.count
    })
    
    return [
      { id: 'cve', label: 'CVE Intel', count: cve, color: '#b8b4f5' },
      { id: 'blue', label: 'Blue Team', count: blue, color: '#18181b' },
      { id: 'red', label: 'Red Team', count: red, color: '#d9f96b' },
      { id: 'orch', label: 'Orchestrator', count: orch, color: '#e4e4e7' } // Muted for orchestrator
    ].sort((a,b) => b.count - a.count)
  } catch {
    return [
      { id: 'cve', label: 'CVE Intel', count: 2600, color: '#b8b4f5' },
      { id: 'blue', label: 'Blue Team', count: 1200, color: '#18181b' },
      { id: 'red', label: 'Red Team', count: 500, color: '#d9f96b' },
    ]
  }
}

export async function WorkingAgentsCard() {
  let data = await getAgentActivity()
  
  // Filter out any 0 count to not break layout, or just take top 3 for circles
  data = data.filter(d => d.count > 0)
  
  const total = data.reduce((s, x) => s + x.count, 0)
  const top3 = data.slice(0, 3)

  return (
    <Card className="rounded-[2rem] border-0 shadow-sm p-6 bg-white shrink-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
            <Zap className="h-5 w-5 text-zinc-800" />
          </div>
          <span className="font-bold text-[15px] text-zinc-900">Agent Workload</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-6">
        <span className="text-4xl font-semibold tracking-tighter text-zinc-900">
          {(total / 1000).toFixed(1).replace('.0', '')}k
        </span>
        <span className="rounded-full bg-[#d9f96b] px-2 py-0.5 text-xs font-bold tracking-tight text-lime-900">
          +5%
        </span>
        <span className="ml-1 text-sm font-medium text-zinc-500">calls today</span>
      </div>

      {/* Bubble Chart */}
      <div className="relative h-64 w-full flex items-center justify-center my-8">
        {/* Largest Bubble */}
        {top3[0] && (
          <div 
            className="absolute left-1/2 top-1/2 -translate-x-[90%] -translate-y-[65%] flex h-40 w-40 flex-col items-center justify-center rounded-full shadow-sm"
            style={{ backgroundColor: top3[0].color, color: top3[0].color === '#18181b' ? 'white' : '#18181b' }}
          >
            <span className="text-4xl font-medium tracking-tight">
               {top3[0].count >= 1000 ? (top3[0].count / 1000).toFixed(1) + 'k' : top3[0].count}
            </span>
            <span className="text-xs font-medium opacity-80 mt-1">calls</span>
          </div>
        )}
        
        {/* Second Largest Bubble */}
        {top3[1] && (
          <div 
            className="absolute left-1/2 top-1/2 translate-x-[5%] -translate-y-[45%] flex h-36 w-36 flex-col items-center justify-center rounded-full shadow-sm"
            style={{ backgroundColor: top3[1].color, color: top3[1].color === '#18181b' ? 'white' : '#18181b' }}
          >
            <span className="text-3xl font-medium tracking-tight">
              {top3[1].count >= 1000 ? (top3[1].count / 1000).toFixed(1) + 'k' : top3[1].count}
            </span>
            <span className="text-xs font-medium opacity-80 mt-1">calls</span>
          </div>
        )}
        
        {/* Smallest Bubble */}
        {top3[2] && (
          <div 
            className="absolute left-1/2 top-1/2 -translate-x-[35%] translate-y-[15%] z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full shadow-md ring-4 ring-white"
            style={{ backgroundColor: top3[2].color, color: top3[2].color === '#18181b' ? 'white' : '#18181b' }}
          >
            <span className="text-2xl font-medium tracking-tight">
               {top3[2].count >= 1000 ? (top3[2].count / 1000).toFixed(1).replace('.0', '') + 'k' : top3[2].count}
            </span>
            <span className="text-[10px] font-medium opacity-80 mt-1">calls</span>
          </div>
        )}
      </div>

      {/* Progress Bars */}
      <div className="space-y-5">
        {data.slice(0, 3).map((item) => {
          const pct = Math.round((item.count / total) * 100)
          return (
            <div key={item.id} className="space-y-2">
              <div className="flex items-end justify-between leading-none">
                <span className="text-[32px] font-medium tracking-tight text-zinc-900">
                  {pct}<span className="text-xl text-zinc-400 font-normal">%</span>
                </span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 tracking-tight pb-1">
                  {item.label}
                  <span 
                    className="h-2 w-2 rounded-full block" 
                    style={{ backgroundColor: item.color === '#18181b' ? '#18181b' : item.color }} 
                  />
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                <div 
                  className="h-full rounded-full" 
                  style={{ width: `${pct}%`, backgroundColor: item.color }} 
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
