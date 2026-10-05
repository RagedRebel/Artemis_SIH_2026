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
  const reviewerId = typeof body?.reviewerId === 'string' && body.reviewerId.length > 0 ? body.reviewerId : null

  if (reviewerId) {
    const check = await db.query(`SELECT role FROM users WHERE id = $1`, [reviewerId])
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Reviewer not found' }, { status: 404 })
    }
  }

  const res = await db.query(
    `UPDATE findings SET assigned_reviewer = $1 WHERE id = $2 RETURNING id, assigned_reviewer`,
    [reviewerId, id]
  )
  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
  }

  return NextResponse.json({ id, assignedReviewer: res.rows[0].assigned_reviewer })
}
