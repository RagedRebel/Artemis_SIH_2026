'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateJiraConnection(id: string, data: { project_key?: string; issue_type?: string }) {
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (data.project_key !== undefined) {
    updates.push(`project_key = $${idx++}`)
    values.push(data.project_key)
  }
  if (data.issue_type !== undefined) {
    updates.push(`issue_type = $${idx++}`)
    values.push(data.issue_type)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = NOW()`)
  values.push(id)

  await db.query(
    `UPDATE jira_connections SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  )
  revalidatePath('/integrations/jira')
}

export async function disconnectJira(id: string) {
  await db.query(
    `UPDATE jira_connections SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  )
  revalidatePath('/integrations/jira')
}
