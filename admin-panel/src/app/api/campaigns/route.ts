import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { v4 as uuid } from 'uuid'
import { ensureRedisConnected } from '@/lib/redis-client'
import { auth } from '@/lib/auth'
import { encryptSecret } from '@/lib/crypto'

const VALID_CRED_TYPES = ['ssh', 'winrm', 'http_basic', 'ad_domain', 'api_token', 'database'] as const
type CredType = (typeof VALID_CRED_TYPES)[number]

interface IncomingCredential {
  targetHost: string
  credType: CredType
  username: string
  secret: string
  metadata?: { domain?: string; port?: number }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '20', 10)
  const offset = (page - 1) * limit

  const result = await db.query(
    'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  )
  const total = await db.query('SELECT COUNT(*)::int as count FROM campaigns')

  return NextResponse.json({
    campaigns: result.rows,
    total: total.rows[0].count,
    page,
    limit,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const createdBy = session.user.email || (session.user as any).username || session.user.name || 'unknown'

  const body = await req.json()
  const { name, targetScope, maxRiskLevel, enableCveTesting, testingMode, credentials } = body

  if (!name || !targetScope?.length) {
    return NextResponse.json({ error: 'name and targetScope are required' }, { status: 400 })
  }

  const mode: 'black_box' | 'white_box' = testingMode === 'white_box' ? 'white_box' : 'black_box'
  const credsToPersist: IncomingCredential[] = []
  if (mode === 'white_box' && Array.isArray(credentials)) {
    for (const c of credentials as IncomingCredential[]) {
      if (!c || typeof c !== 'object') continue
      if (!c.targetHost || !c.username || !c.secret) {
        return NextResponse.json({ error: 'credential rows require targetHost, username, secret' }, { status: 400 })
      }
      if (!VALID_CRED_TYPES.includes(c.credType)) {
        return NextResponse.json({ error: `invalid credType: ${c.credType}` }, { status: 400 })
      }
      credsToPersist.push(c)
    }
  }

  const id = uuid()
  await db.query(
    `INSERT INTO campaigns (id, name, target_scope, max_risk_level, testing_mode, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
    [id, name, targetScope, maxRiskLevel ?? 'high', mode, createdBy]
  )

  const createdByUserId = (session.user as { id?: string }).id ?? null

  for (const c of credsToPersist) {
    try {
      const enc = encryptSecret(c.secret)
      await db.query(
        `INSERT INTO campaign_credentials
           (id, campaign_id, target_host, cred_type, username, encrypted_secret, iv, auth_tag, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [
          uuid(),
          id,
          c.targetHost.trim(),
          c.credType,
          c.username.trim(),
          enc.ciphertext,
          enc.iv,
          enc.authTag,
          JSON.stringify(c.metadata ?? {}),
          createdByUserId,
        ]
      )
    } catch (err) {
      console.error('[campaigns] credential encryption/insert failed:', err)
      try { await db.query('DELETE FROM campaign_credentials WHERE campaign_id = $1', [id]) } catch {}
      try { await db.query('DELETE FROM campaigns WHERE id = $1', [id]) } catch {}
      return NextResponse.json(
        {
          error:
            'Could not encrypt/persist credentials. Ensure ATHENIX_MASTER_KEY is set to a 32-byte hex value.',
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      )
    }
  }

  const payload = {
    campaignId: id,
    name,
    targetScope,
    maxRiskLevel: maxRiskLevel ?? 'high',
    enableCveTesting: enableCveTesting ?? true,
    testingMode: mode,
    createdBy,
  }

  try {
    const redis = await ensureRedisConnected()
    await redis.rpush('queue:campaign_requests', JSON.stringify(payload))
  } catch (err) {
    console.error('[campaigns] Redis rpush failed:', err)
    try {
      await db.query('DELETE FROM campaign_credentials WHERE campaign_id = $1', [id])
    } catch (credErr) {
      console.error('[campaigns] Credential rollback failed:', credErr)
    }
    try {
      await db.query('DELETE FROM campaigns WHERE id = $1', [id])
    } catch (delErr) {
      console.error('[campaigns] Rollback delete failed:', delErr)
    }
    return NextResponse.json(
      {
        error:
          'Could not queue campaign for processing. Start Redis and set REDIS_URL (e.g. redis://localhost:6379), or use the same Redis as the campaign-handler.',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { id, status: 'queued', enableCveTesting: enableCveTesting ?? true, testingMode: mode },
    { status: 201 }
  )
}
