'use client'

import { useEffect, useState } from 'react'

export function ClientDate({ date, format = 'medium' }: { date: string | Date, format?: 'medium' | 'short' }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Return a dummy string with similar length to prevent layout shift
    // or return the raw UTC ISO string so SSR passes, then swap to formatted
    return <span className="opacity-0">Loading...</span>
  }

  const d = new Date(date)
  if (format === 'medium') {
    return <span>{d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
  }

  return <span>{d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
}
