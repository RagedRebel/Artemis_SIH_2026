'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { OctagonX } from 'lucide-react'

export function AbortCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleAbort() {
    setBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        router.refresh()
      }
    } catch {
      // silent
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50"
        onClick={() => setConfirming(true)}
      >
        <OctagonX className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Abort campaign
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-red-700">Abort this campaign?</span>
      <Button
        type="button"
        size="sm"
        className="bg-red-600 text-white hover:bg-red-700"
        disabled={busy}
        onClick={handleAbort}
      >
        {busy ? 'Aborting…' : 'Confirm abort'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  )
}
