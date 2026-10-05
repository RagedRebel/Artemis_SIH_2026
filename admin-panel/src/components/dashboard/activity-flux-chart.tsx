'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useState, useEffect, type ReactElement } from 'react'

export type ActivityBarDatum = { label: string; value: number; highlight?: boolean }

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ value?: unknown }>
  label?: string | number
}): ReactElement | null {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value
  const value = typeof raw === 'number' ? raw : Number(raw)
  return (
    <div className="rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-sm px-4 py-3 text-sm shadow-xl shadow-zinc-900/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Window</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-zinc-900">{label != null ? String(label) : '—'}</p>
      <p className="mt-2 border-t border-zinc-100 pt-2 text-xs font-medium text-zinc-500">Events</p>
      <div className="flex items-center gap-2 mt-0.5">
        <div className="w-2.5 h-2.5 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
        <p className="text-xl font-bold tabular-nums text-zinc-900 leading-none">{Number.isFinite(value) ? value : '—'}</p>
      </div>
    </div>
  )
}

export function ActivityFluxChart({ data }: { data: ActivityBarDatum[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="h-[230px] w-full pt-4">
      {!mounted ? null : <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#84cc16" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#84cc16" floodOpacity="0.3" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717a', fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            minTickGap={15}
          />
          <YAxis
            tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickMargin={8}
          />
          <Tooltip
            cursor={{ stroke: '#d4d4d8', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={props => <ActivityTooltip {...props} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#65a30d"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorValue)"
            filter="url(#glow)"
            activeDot={{
              r: 6,
              fill: '#bef264',
              stroke: '#3f6212',
              strokeWidth: 2,
              className: 'shadow-lg outline-none',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>}
    </div>
  )
}
