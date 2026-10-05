'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateJiraConnection, disconnectJira } from './actions'

export function JiraConnectionCard({
  id,
  siteUrl,
  projectKey,
  issueType,
  createdAt,
}: {
  id: string
  siteUrl: string
  projectKey: string
  issueType: string
  createdAt: string
}) {
  const [editKey, setEditKey] = useState(projectKey)
  const [editType, setEditType] = useState(issueType)
  const [editing, setEditing] = useState(!projectKey)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateJiraConnection(id, { project_key: editKey, issue_type: editType })
      setEditing(false)
    })
  }

  function handleDisconnect() {
    if (!confirm('Disconnect this Jira workspace?')) return
    startTransition(async () => {
      await disconnectJira(id)
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
              <span className="text-sm font-medium text-zinc-900">{siteUrl}</span>
            </div>

            {editing ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-600">Project Key</span>
                  <input
                    type="text"
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value.toUpperCase())}
                    placeholder="e.g. SEC"
                    className="block w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-600">Issue Type</span>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  >
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                    <option value="Story">Story</option>
                    <option value="Epic">Epic</option>
                  </select>
                </label>
                <Button size="sm" onClick={handleSave} disabled={isPending || !editKey}>
                  {isPending ? 'Saving...' : 'Save'}
                </Button>
                {projectKey && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4 text-sm text-zinc-600">
                <span>
                  Project: <strong className="text-zinc-800">{projectKey}</strong>
                </span>
                <span>
                  Issue Type: <strong className="text-zinc-800">{issueType}</strong>
                </span>
                <button onClick={() => setEditing(true)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Edit
                </button>
              </div>
            )}

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
