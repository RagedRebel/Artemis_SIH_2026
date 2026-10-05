'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface CvssData {
  range: string
  count: number
}

function rangeColor(range: string): string {
  if (range.startsWith('9')) return '#ef4444'
  if (range.startsWith('7') || range.startsWith('8')) return '#f97316'
  if (range.startsWith('4') || range.startsWith('5') || range.startsWith('6')) return '#eab308'
  return '#22c55e'
}

export function CvssHistogram({ data }: { data: CvssData[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="range" stroke="#71717a" fontSize={10} tickLine={false} />
          <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
            itemStyle={{ color: '#fafafa' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.range} fill={rangeColor(entry.range)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
