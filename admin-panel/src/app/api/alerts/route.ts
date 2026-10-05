import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  const result = await db.query(
    'SELECT * FROM siem_alerts ORDER BY timestamp DESC LIMIT $1',
    [limit]
  )

  return NextResponse.json({ alerts: result.rows, total: result.rows.length })
}
