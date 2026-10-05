import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const campaignId = searchParams.get('campaignId')
  const severity = searchParams.get('severity')
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = 'SELECT * FROM findings WHERE 1=1'
  const params: unknown[] = []
  let idx = 1

  if (campaignId) {
    query += ` AND campaign_id = $${idx++}`
    params.push(campaignId)
  }
  if (severity) {
    query += ` AND severity = $${idx++}`
    params.push(severity)
  }
  if (status) {
    query += ` AND status = $${idx++}`
    params.push(status)
  }

  query += ` ORDER BY cvss_score DESC LIMIT $${idx++} OFFSET $${idx++}`
  params.push(limit, offset)

  const result = await db.query(query, params)

  return NextResponse.json({ findings: result.rows, page, limit })
}
