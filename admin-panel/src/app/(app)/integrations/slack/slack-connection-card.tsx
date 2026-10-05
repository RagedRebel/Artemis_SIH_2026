'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateSlackConnection, disconnectSlack } from './actions'

export function SlackConnectionCard({
  id,
  teamName,
  channelName,
  channelId,
  notifyIncidents,
  notifyApprovals,
  createdAt,
}: {
  id: string
  teamName: string
  channelName: string
  channelId: string
  notifyIncidents: boolean
  notifyApprovals: boolean
  createdAt: string
}) {
  const [incidents, setIncidents] = useState(notifyIncidents)
  const [approvals, setApprovals] = useState(notifyApprovals)
  const [channel, setChannel] = useState(channelId)
  const [chanName, setChanName] = useState(channelName)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateSlackConnection(id, {
        channel_id: channel,
        channel_name: chanName,
        notify_incidents: incidents,
        notify_approvals: approvals,
      })
      setEditing(false)
    })
  }

  function handleToggle(field: 'incidents' | 'approvals') {
    const newIncidents = field === 'incidents' ? !incidents : incidents
    const newApprovals = field === 'approvals' ? !approvals : approvals

    if (field === 'incidents') setIncidents(newIncidents)
    if (field === 'approvals') setApprovals(newApprovals)

    startTransition(async () => {
      await updateSlackConnection(id, {
        notify_incidents: newIncidents,
        notify_approvals: newApprovals,
      })
    })
  }

  function handleDisconnect() {
    if (!confirm('Disconnect this Slack workspace?')) return
    startTransition(async () => {
      await disconnectSlack(id)
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
              <span className="text-sm font-medium text-zinc-900">{teamName}</span>
              {channelName && (
                <span className="text-sm text-zinc-500">#{channelName}</span>
              )}
            </div>

            {editing ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-600">Channel ID</span>
                  <input
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    placeholder="C0123456789"
                    className="block w-40 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-600">Channel Name</span>
                  <input
                    type="text"
                    value={chanName}
                    onChange={(e) => setChanName(e.target.value)}
                    placeholder="general"
                    className="block w-40 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </label>
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  {isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Change channel
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={incidents}
                  onChange={() => handleToggle('incidents')}
                  disabled={isPending}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                Incident notifications
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={approvals}
                  onChange={() => handleToggle('approvals')}
                  disabled={isPending}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                Approval notifications
              </label>
            </div>

            <p className="text-xs text-zinc-400" suppressHydrationWarning>
              Connected {new Date(createdAt).toLocaleDateString()}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isPending}>
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
