'use client'

import { useEffect, useState } from 'react'

export function useAuditStream(initialRows: Record<string, unknown>[], campaignId?: string) {
  const [rows, setRows] = useState(initialRows)

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  useEffect(() => {
    // Determine the URL, including the optional campaignId filter
    const url = campaignId ? `/api/audit/live?campaignId=${campaignId}` : '/api/audit/live'
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const newRow = JSON.parse(event.data)
        // Ensure new rows are prepended (assuming the list is sorted descending by timestamp)
        setRows((prev) => [newRow, ...prev])
      } catch {
        // Ignore malformed payloads
      }
    }

    eventSource.onerror = () => {
      // It will auto-reconnect, but we can close it if needed.
    }

    return () => {
      eventSource.close()
    }
  }, [campaignId])

  return rows
}
