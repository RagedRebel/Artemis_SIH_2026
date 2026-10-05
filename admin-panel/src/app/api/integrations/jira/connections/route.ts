import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await db.query(
    `SELECT id, site_url, cloud_id, project_key, issue_type, is_active, created_at, updated_at
     FROM jira_connections ORDER BY created_at DESC`
  )

  return NextResponse.json({ connections: result.rows })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing connection id' }, { status: 400 })
  }

  await db.query(`UPDATE jira_connections SET is_active = false, updated_at = NOW() WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}
