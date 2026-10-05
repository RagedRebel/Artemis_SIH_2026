'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useState, useEffect } from 'react'

interface SeverityData {
  name: string
  value: number
}

const COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
  info: '#2563eb',
}

export function SeverityPie({ data }: { data: SeverityData[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Filter out 0 counts to avoid empty invisible paths rendering
  const activeData = data.filter(d => d.value > 0);

  if (activeData.length === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center px-6">
        <p className="text-sm text-zinc-400 text-center leading-relaxed">
          Run your first campaign to get severity mix for your target scope
        </p>
      </div>
    )
  }

  return (
    <div className="h-64 w-full relative">
      {!mounted ? null : <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <foreignObject x="calc(50% - 40px)" y="calc(39% - 40px)" width="80" height="80">
            <div className="relative flex h-full w-full items-center justify-center rounded-full bg-white shadow-[0_0_24px_rgba(0,0,0,0.04)] border border-zinc-100">
              {/* Outer pulsing ring */}
              <div className="absolute inset-[6px] rounded-full border-[1.5px] border-zinc-200 border-t-zinc-800 animate-[spin_4s_cubic-bezier(0.4,0,0.2,1)_infinite] opacity-70" />
              {/* Breathing inner circle */}
              <div className="absolute inset-[15px] rounded-full bg-zinc-50 border border-zinc-200/80 animate-[pulse_2s_ease-in-out_infinite]" />
              {/* Core dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 shadow-[0_0_12px_rgba(24,24,27,0.6)] relative z-10" />
            </div>
          </foreignObject>
          <Pie
            data={activeData}
            cx="50%"
            cy="45%"
            innerRadius={65}
            outerRadius={90}
            paddingAngle={6}
            cornerRadius={12}
            dataKey="value"
            nameKey="name"
            stroke="none"
          >
            {activeData.map(entry => (
              <Cell 
                key={entry.name} 
                fill={COLORS[entry.name] ?? '#a1a1aa'} 
                className="hover:opacity-80 transition-opacity outline-none"
              />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-sm px-4 py-3 text-sm shadow-xl shadow-zinc-900/5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[data.name] }} />
                      <p className="font-semibold uppercase tracking-wide text-zinc-500 text-[10px]">{data.name} Severity</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900 leading-none">{data.value}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            content={(props) => {
              const { payload } = props;
              return (
                <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-4">
                  {payload?.map((entry, index) => (
                    <li key={`item-${index}`} className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                      <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="capitalize">{entry.value}</span>
                    </li>
                  ))}
                </ul>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>}
    </div>
  )
}
