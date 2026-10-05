import IORedis from 'ioredis'

const RedisImpl = (IORedis as unknown as { default?: typeof IORedis }).default ?? IORedis

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let client: InstanceType<typeof RedisImpl> | null = null

export function getRedis(): InstanceType<typeof RedisImpl> {
  if (!client) {
    client = new RedisImpl(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 5000)
      },
    })
    client.on('error', (err: Error) => {
      console.error('[admin-panel redis]', err.message)
    })
  }
  return client
}

/** Throws if Redis is unreachable (so API can 503 instead of leaving a queued campaign with no job). */
export async function ensureRedisConnected(): Promise<InstanceType<typeof RedisImpl>> {
  const r = getRedis()
  await r.ping()
  return r
}
