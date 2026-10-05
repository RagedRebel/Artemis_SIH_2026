'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { closeIncidentInJira } from '@/lib/integrations/jira-sync'

export async function closeIncident(id: string) {
  try {
    await db.query(
      `UPDATE incidents SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
      [id]
    )

    closeIncidentInJira(id).catch((err) =>
      console.error('Failed to sync incident close to Jira:', err)
    )

    revalidatePath('/incidents')
  } catch (error) {
    console.error('Failed to close incident:', error)
  }
}
