'use client'

import { useEffect, useState } from 'react'

export function RunningTimer({ startedAt }: { startedAt: string | Date }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    
    const update = () => {
      const now = Date.now()
      const diff = Math.max(0, now - start) // difference in ms
      
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      const parts = []
      if (hours > 0) {
        parts.push(`${hours.toString().padStart(2, '0')}`)
      }
      parts.push(`${minutes.toString().padStart(2, '0')}`)
      parts.push(`${seconds.toString().padStart(2, '0')}`)

      setElapsed(parts.join(':'))
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!elapsed) return null

  return <span className="font-mono tabular-nums">{elapsed}</span>
}