import { db } from './db'

/**
 * Checks if there are no users in the database.
 * If zero users exist, setup is needed.
 */
export async function needsSetup(): Promise<boolean> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users')
    return parseInt(result.rows[0].count, 10) === 0
  } catch (error) {
    console.error('Failed to check if setup is needed:', error)
    // If we can't connect or table doesn't exist, we assume true to allow setup, 
    // or false to prevent open access? Let's return true, but the setup will fail if db is down anyway.
    return true
  }
}
