import { db } from '../../shared/db-client.js'
import { decryptSecret } from '../../shared/crypto.js'

export type CredType = 'ssh' | 'winrm' | 'http_basic' | 'ad_domain' | 'api_token' | 'database'

export interface ResolvedCredential {
  id: string
  campaignId: string
  targetHost: string
  credType: CredType
  username: string
  secret: string
  metadata: Record<string, unknown>
}

export async function isWhiteBox(campaignId: string): Promise<boolean> {
  const r = await db.query('SELECT testing_mode FROM campaigns WHERE id = $1', [campaignId])
  return r.rows[0]?.testing_mode === 'white_box'
}

export async function resolveCredentials(
  campaignId: string,
  filter: { targetHost?: string; credType?: CredType } = {}
): Promise<ResolvedCredential[]> {
  if (!(await isWhiteBox(campaignId))) return []

  const conditions = ['campaign_id = $1']
  const params: unknown[] = [campaignId]
  if (filter.targetHost) {
    params.push(filter.targetHost)
    conditions.push(`target_host = $${params.length}`)
  }
  if (filter.credType) {
    params.push(filter.credType)
    conditions.push(`cred_type = $${params.length}`)
  }

  const r = await db.query(
    `SELECT id, campaign_id, target_host, cred_type, username,
            encrypted_secret, iv, auth_tag, metadata
       FROM campaign_credentials
      WHERE ${conditions.join(' AND ')}`,
    params
  )

  return r.rows.map((row: any) => ({
    id: row.id,
    campaignId: row.campaign_id,
    targetHost: row.target_host,
    credType: row.cred_type as CredType,
    username: row.username,
    secret: decryptSecret({
      ciphertext: row.encrypted_secret,
      iv: row.iv,
      authTag: row.auth_tag,
    }),
    metadata: row.metadata ?? {},
  }))
}

export async function pickFirstCredential(
  campaignId: string,
  filter: { targetHost?: string; credType?: CredType } = {}
): Promise<ResolvedCredential | null> {
  const all = await resolveCredentials(campaignId, filter)
  if (all.length === 0) return null
  if (filter.targetHost) {
    const exact = all.find(c => c.targetHost === filter.targetHost)
    if (exact) return exact
  }
  return all[0]
}
