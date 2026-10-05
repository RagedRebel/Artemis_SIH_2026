'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Activity, Flame } from 'lucide-react'
import { useEffect, useState } from 'react'

interface SystemWellnessProps {
  totalEvents: number
  avgEventsPerHour: number
  criticalCount: number
  totalFindings: number
}

export function SystemWellnessLayout({
  totalEvents,
  avgEventsPerHour,
  criticalCount,
  totalFindings,
}: SystemWellnessProps) {
  // We use consistent mock data for hydration safety
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Calculate Security Posture Index based on findings
  // Higher ratio of low/info vs high/critical = higher % score.
  // 100% - (critical * 2 + high * 1) / totalFindings
  const postureScore = totalFindings === 0 ? 100 : Math.max(0, 100 - Math.round(((criticalCount * 2.5) / totalFindings) * 100))

  // Dynamically generate column height mock logic loosely based on posture score
  const dotDensity = Math.max(2, Math.floor(postureScore / 15)) // Max 6-7 height 
  const chartColumns = [
    [dotDensity, 0], [dotDensity + 1, 1], [dotDensity + 1, 2], [dotDensity - 1, 0], 
    [dotDensity, 1], [dotDensity - 1, 0], [dotDensity + 1, 1], [dotDensity - 1, 0], 
    [dotDensity + 2, 2], [dotDensity, 0], [dotDensity + 4, 1], [dotDensity, 1]
  ]

  // Formats totalEvents to "1.2k" if > 1000
  const formattedEvents = totalEvents >= 1000 ? (totalEvents / 1000).toFixed(1) + 'k' : totalEvents

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
      {/* Left Column */}
      <div className="flex flex-col gap-4">
        {/* Heart Rate -> Event Velocity */}
        <Card className="rounded-[32px] shadow-sm border-zinc-100 flex-1 relative bg-white">
          <CardContent className="p-7 flex flex-col justify-between h-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-zinc-50 p-3 rounded-full text-zinc-800">
                <Activity className="h-6 w-6" />
              </div>
              <span className="font-semibold text-[17px] text-zinc-900 tracking-tight">Event Velocity</span>
            </div>
            
            <div className="flex items-end justify-between mt-auto">
              <div className="flex items-baseline gap-1">
                <span className="text-[52px] leading-none font-medium tracking-tighter text-zinc-900">{formattedEvents}</span>
              </div>
              <div className="text-right flex flex-col justify-end pb-1">
                <span className="text-[13px] font-bold text-zinc-900">Avg</span>
                <span className="text-[14px] text-zinc-800 font-medium">{Math.round(avgEventsPerHour)} EPS</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actionable Coverage -> Critical Exploits */}
        <Card className="rounded-[32px] shadow-sm border-zinc-100 flex-1 relative bg-white mt-1">
          <CardContent className="p-7 flex flex-col justify-between h-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-red-50 p-3 rounded-full text-red-600">
                <Flame className="h-6 w-6" />
              </div>
              <span className="font-semibold text-[17px] text-zinc-900 tracking-tight">Critical Risks</span>
            </div>
            
            <div className="flex items-end justify-between mt-auto">
              <div className="flex items-baseline gap-1">
                <span className="text-[52px] leading-none font-medium tracking-tighter text-zinc-900">{criticalCount}</span>
                <span className="text-zinc-500 font-medium text-[15px] ml-2">Exploits</span>
              </div>
              <div className="text-right flex flex-col justify-end pb-1">
                <span className="text-[13px] font-bold text-red-700">Active</span>
                <span className="text-[14px] text-red-600 font-medium">Threats</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column (Wellness Index) */}
      <Card className="rounded-[32px] shadow-sm border-zinc-100 relative overflow-hidden flex flex-col bg-white">
        <CardContent className="p-7 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-zinc-50 p-3 rounded-full text-zinc-800 font-medium flex items-center justify-center w-12 h-12 text-lg">
              %
            </div>
            <span className="font-semibold text-[17px] text-zinc-900 tracking-tight">Security Posture</span>
          </div>

          <div className="flex items-start gap-4 mt-3 mb-8">
            <div className="flex items-baseline gap-1">
              <span className="text-[64px] leading-none font-medium tracking-tighter text-zinc-900">{postureScore}</span>
              <span className="text-zinc-500 font-medium text-lg ml-1">%</span>
            </div>
            {postureScore >= 80 ? (
              <span className="bg-[#cdfc67] text-lime-950 px-3 py-1 rounded-xl text-sm font-bold mt-2">
                Stable
              </span>
            ) : postureScore >= 50 ? (
              <span className="bg-orange-100 text-orange-950 px-3 py-1 rounded-xl text-sm font-bold mt-2">
                At Risk
              </span>
            ) : (
              <span className="bg-red-100 text-red-950 px-3 py-1 rounded-xl text-sm font-bold mt-2">
                Critical
              </span>
            )}
          </div>

          <div className="flex-1 mt-auto flex items-end justify-between gap-[2px] w-full pt-6">
            {chartColumns.map(([activeHeight, faintHeight], colIndex) => (
              <div key={colIndex} className="flex flex-col-reverse justify-start items-center gap-2 w-full max-w-[1.5rem]">
                {[...Array(8)].map((_, rowIndex) => {
                  let dotColor = 'bg-transparent'
                  
                  if (!mounted) {
                    dotColor = rowIndex < activeHeight ? 'bg-violet-300' : 'bg-transparent'
                  } else {
                    if (rowIndex < activeHeight) {
                      dotColor = (colIndex + rowIndex) % 3 === 0 ? 'bg-violet-400/90' : 'bg-violet-300/80'
                    } else if (rowIndex < activeHeight + faintHeight) {
                      dotColor = 'bg-violet-100/50'
                    } else if (Math.random() > 0.8) {
                      dotColor = 'bg-violet-50/40' // very faint background dots simulating the image scatter
                    }
                  }

                  return (
                    <div 
                      key={rowIndex} 
                      className={`w-[14px] h-[14px] sm:w-4 sm:h-4 lg:w-[18px] lg:h-[18px] rounded-full ${dotColor} transition-all duration-700 mx-auto`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
