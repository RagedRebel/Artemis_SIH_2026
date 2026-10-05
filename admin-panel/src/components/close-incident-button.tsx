'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { closeIncident } from '@/app/(app)/incidents/actions'

export function CloseIncidentButton({ id, status }: { id: string, status: string }) {
  const [isPending, setIsPending] = useState(false)

  if (status === 'resolved' || status === 'false_positive') {
    return null
  }

  return (
    <Button
      
      size="sm"
      className="mt-2 bg-primary from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 border-0"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true)
        await closeIncident(id)
        setIsPending(false)
      }}
    >
      <Check className="mr-1 h-3.5 w-3.5" />
      {isPending ? 'Closing...' : 'Close Incident'}
    </Button>
  )
}
