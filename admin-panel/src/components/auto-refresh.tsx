'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

export function AutoRefresh({ interval = 5000 }: { interval?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const id = setInterval(() => {
      if (!isPending && document.visibilityState === 'visible') {
        startTransition(() => {
          router.refresh()
        })
      }
    }, interval)

    return () => clearInterval(id)
  }, [router, interval, isPending])

  return null
}
