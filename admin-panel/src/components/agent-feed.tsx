'use client'

import { useEffect, useRef, useState } from 'react'

interface FeedLine {
  timestamp: string
  agent: string
  type: 'tool_call' | 'output' | 'finding' | 'error' | 'info'
  content: string
}

const colorMap: Record<string, string> = {
  tool_call: 'text-blue-400',
  output: 'text-green-300',
  finding: 'text-red-400',
  error: 'text-red-600',
  info: 'text-zinc-400',
}

export function AgentFeed({ campaignId }: { campaignId: string }) {
  const [lines, setLines] = useState<FeedLine[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const eventSource = new EventSource(`/api/campaigns/${campaignId}/live`)

    eventSource.onmessage = (event) => {
      try {
        const line: FeedLine = JSON.parse(event.data)
        setLines(prev => [...prev.slice(-500), line])
      } catch {
        // Skip malformed events
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => eventSource.close()
  }, [campaignId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="h-96 overflow-y-auto border-t border-zinc-200 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
      {lines.length === 0 && (
        <div className="text-zinc-600 italic">Waiting for agent events...</div>
      )}
      {lines.map((line, i) => {
        const timeStr = line.timestamp ? new Date(line.timestamp).toLocaleTimeString([], { hour12: false }) : ''
        return (
          <div key={i} className={`mb-0.5 ${colorMap[line.type] ?? 'text-zinc-300'}`}>
            <span className="text-zinc-500">[{timeStr}]</span>
            {' '}
            <span className="text-purple-400 font-semibold">[{line.agent}]</span>
            {' '}{line.content}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
