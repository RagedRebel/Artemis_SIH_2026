import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Fetch pending approvals
    const approvals = await db.query(
      `SELECT id, action_description as title, 'Approval Request' as description, requested_at as timestamp, 'approval' as type, risk_level as severity 
       FROM approval_requests 
       WHERE status = 'pending' 
       ORDER BY requested_at DESC LIMIT 5`
    )

    // Fetch open incidents
    const incidents = await db.query(
      `SELECT id, title, description, created_at as timestamp, 'incident' as type, severity 
       FROM incidents 
       WHERE status IN ('open', 'investigating') 
       ORDER BY created_at DESC LIMIT 5`
    )

    // Fetch recent SIEM alerts
    const alerts = await db.query(
      `SELECT id, rule_description as title, 'SIEM Alert' as description, timestamp, 'siem' as type, 
       CASE 
         WHEN severity >= 12 THEN 'critical' 
         WHEN severity >= 8 THEN 'high' 
         WHEN severity >= 4 THEN 'medium'
         ELSE 'low' 
       END as severity 
       FROM siem_alerts 
       ORDER BY timestamp DESC LIMIT 5`
    )

    const items = [
      ...approvals.rows,
      ...incidents.rows,
      ...alerts.rows
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10)

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    return NextResponse.json({ items: [] })
  }
}
