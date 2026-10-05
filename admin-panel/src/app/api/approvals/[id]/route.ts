import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const responder = session.user.email || (session.user as any).username || session.user.name || 'unknown'

  const { id } = await params
  const url = new URL(req.url)
  const action = url.pathname.endsWith('/approve') ? 'approved' : url.pathname.endsWith('/deny') ? 'denied' : null

  if (!action) {
    const body = await req.json()
    const decision = body.decision as string

    if (decision !== 'approved' && decision !== 'denied') {
      return NextResponse.json({ error: 'decision must be approved or denied' }, { status: 400 })
    }

    await db.query(
      "UPDATE approval_requests SET status = $1, responded_at = NOW(), responded_by = $3 WHERE id = $2",
      [decision, id, responder]
    )

    return NextResponse.json({ id, status: decision })
  }

  await db.query(
    "UPDATE approval_requests SET status = $1, responded_at = NOW(), responded_by = $3 WHERE id = $2",
    [action, id, responder]
  )

  return NextResponse.json({ id, status: action })
}
