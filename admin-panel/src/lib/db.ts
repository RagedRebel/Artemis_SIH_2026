import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://artemis:artemis_db_secret@localhost:5433/artemis',
  max: 10,
  idleTimeoutMillis: 30000,
})

pool.on('error', (err) => {
  console.error('Admin panel DB pool error:', err)
})

export const db = {
  query: <R extends pg.QueryResultRow = any>(text: string, params?: unknown[]) => pool.query<R>(text, params),
}
