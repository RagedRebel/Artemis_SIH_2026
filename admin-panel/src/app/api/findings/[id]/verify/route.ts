import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { ensureRedisConnected } from '@/lib/redis-client'

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

  const cur = await db.query(
    `SELECT id, title, severity, affected_host, status, campaign_id FROM findings WHERE id = $1`,
    [id]
  )
  if (cur.rows.length === 0) return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
  const row = cur.rows[0]
  if (row.status !== 'pending_verification' && row.status !== 'needs_manual_review') {
    return NextResponse.json({ error: `Finding status '${row.status}' cannot be verified.` }, { status: 409 })
  }

  await db.query(
    `UPDATE findings
       SET status = 'verified',
           reviewed_at = NOW(),
           reviewed_by = $1,
           review_notes = COALESCE($2, review_notes)
     WHERE id = $3`,
    [session.user.id, notes, id]
  )

  try {
    const redis = await ensureRedisConnected()
    await redis.publish(
      'new_finding',
      JSON.stringify({
        findingId: id,
        title: row.title,
        severity: row.severity,
        affectedHost: row.affected_host,
        campaignId: row.campaign_id,
        verifiedBy: session.user.id,
      })
    )
  } catch (err) {
    console.error('[findings/verify] redis publish failed:', err)
  }

  return NextResponse.json({ id, status: 'verified' })
}
