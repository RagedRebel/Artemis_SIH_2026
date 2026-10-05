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

  if (body.project_key !== undefined) {
    updates.push(`project_key = $${idx++}`)
    values.push(body.project_key)
  }
  if (body.issue_type !== undefined) {
    updates.push(`issue_type = $${idx++}`)
    values.push(body.issue_type)
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
    `UPDATE jira_connections SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  )

  return NextResponse.json({ success: true })
}
