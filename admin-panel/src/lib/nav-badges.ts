import { db } from '@/lib/db'

export type NavBadges = {
  pendingApprovals: number
  openIncidents: number
}

export async function getNavBadges(): Promise<NavBadges> {
  try {
    const [approvals, incidents] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS c FROM approval_requests WHERE status = 'pending'`),
      db.query(
        `SELECT COUNT(*)::int AS c FROM incidents WHERE status IN ('open', 'investigating')`
      ),
    ])
    return {
      pendingApprovals: approvals.rows[0]?.c ?? 0,
      openIncidents: incidents.rows[0]?.c ?? 0,
    }
  } catch {
    return { pendingApprovals: 0, openIncidents: 0 }
  }
}
