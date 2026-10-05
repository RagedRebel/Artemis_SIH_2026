import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { ensureRedisConnected } from '@/lib/redis-client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const cur = await db.query(`SELECT id, status, name FROM campaigns WHERE id = $1`, [id])
  if (cur.rows.length === 0) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const campaign = cur.rows[0]
  if (campaign.status !== 'running' && campaign.status !== 'queued') {
    return NextResponse.json(
      { error: `Campaign is in '${campaign.status}' status and cannot be aborted.` },
      { status: 409 }
    )
  }

  if (campaign.status === 'queued') {
    await db.query(
      `UPDATE campaigns SET status = 'aborted', ended_at = NOW(), error_message = 'Aborted by user before execution started' WHERE id = $1`,
      [id]
    )
    return NextResponse.json({ id, status: 'aborted' })
  }

  try {
    const redis = await ensureRedisConnected()
    await redis.publish('campaign_abort', JSON.stringify({ campaignId: id }))
  } catch (err) {
    console.error('[campaigns/abort] Redis publish failed:', err)
  }

  await db.query(
    `UPDATE campaigns SET status = 'aborted', ended_at = NOW(), error_message = 'Aborted by user' WHERE id = $1`,
    [id]
  )

  return NextResponse.json({ id, status: 'aborted' })
}
