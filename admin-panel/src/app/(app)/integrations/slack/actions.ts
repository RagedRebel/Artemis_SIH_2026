'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateSlackConnection(
  id: string,
  data: { channel_id?: string; channel_name?: string; notify_incidents?: boolean; notify_approvals?: boolean }
) {
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (data.channel_id !== undefined) {
    updates.push(`channel_id = $${idx++}`)
    values.push(data.channel_id)
  }
  if (data.channel_name !== undefined) {
    updates.push(`channel_name = $${idx++}`)
    values.push(data.channel_name)
  }
  if (data.notify_incidents !== undefined) {
    updates.push(`notify_incidents = $${idx++}`)
    values.push(data.notify_incidents)
  }
  if (data.notify_approvals !== undefined) {
    updates.push(`notify_approvals = $${idx++}`)
    values.push(data.notify_approvals)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = NOW()`)
  values.push(id)

  await db.query(
    `UPDATE slack_connections SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  )
  revalidatePath('/integrations/slack')
}

export async function disconnectSlack(id: string) {
  await db.query(
    `UPDATE slack_connections SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  )
  revalidatePath('/integrations/slack')
}
