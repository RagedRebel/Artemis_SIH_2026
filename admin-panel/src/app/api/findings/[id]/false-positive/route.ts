import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

const REVIEW_ROLES = new Set(['admin', 'analyst', 'pentester'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = session.user.role
  if (!role || !REVIEW_ROLES.has(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const notes = typeof body?.notes === 'string' ? body.notes : null

  const cur = await db.query(`SELECT status FROM findings WHERE id = $1`, [id])
  if (cur.rows.length === 0) return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
  const status = cur.rows[0].status
  if (status !== 'pending_verification' && status !== 'needs_manual_review') {
    return NextResponse.json({ error: `Finding status '${status}' cannot be rejected.` }, { status: 409 })
  }

  await db.query(
    `UPDATE findings
       SET status = 'false_positive',
           reviewed_at = NOW(),
           reviewed_by = $1,
           review_notes = COALESCE($2, review_notes)
     WHERE id = $3`,
    [session.user.id, notes, id]
  )

  return NextResponse.json({ id, status: 'false_positive' })
}
