import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.channel_id !== undefined) {
    updates.push(`channel_id = $${idx++}`)
    values.push(body.channel_id)
  }
  if (body.channel_name !== undefined) {
    updates.push(`channel_name = $${idx++}`)
    values.push(body.channel_name)
  }
  if (body.notify_incidents !== undefined) {
    updates.push(`notify_incidents = $${idx++}`)
    values.push(body.notify_incidents)
  }
  if (body.notify_approvals !== undefined) {
    updates.push(`notify_approvals = $${idx++}`)
    values.push(body.notify_approvals)
  }
  if (body.is_active !== undefined) {
    updates.push(`is_active = $${idx++}`)
    values.push(body.is_active)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push(`updated_at = NOW()`)
  values.push(id)

  await db.query(
    `UPDATE slack_connections SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  )

  return NextResponse.json({ success: true })
}
