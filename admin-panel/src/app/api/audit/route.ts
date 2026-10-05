import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = (page - 1) * limit

  const result = await db.query(
    'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  )

  return NextResponse.json({ logs: result.rows, page, limit })
}
