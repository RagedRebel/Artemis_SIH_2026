import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const responder = session.user.email || (session.user as any).username || session.user.name || 'unknown'

  const { id } = await params

  await db.query(
    "UPDATE approval_requests SET status = 'denied', responded_at = NOW(), responded_by = $2 WHERE id = $1",
    [id, responder]
  )

  return NextResponse.json({ id, status: 'denied' })
}
