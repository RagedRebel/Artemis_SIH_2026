import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new IORedis.default(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000)
  },
})

const subscriber = new IORedis.default(REDIS_URL, {
  maxRetriesPerRequest: 3,
})

redis.on('error', (err: Error) => console.error('Redis error:', err))
subscriber.on('error', (err: Error) => console.error('Redis subscriber error:', err))

export async function publish(channel: string, data: unknown): Promise<void> {
  await redis.publish(channel, JSON.stringify(data))
}

export async function subscribe(
  channel: string,
  handler: (data: unknown) => void
): Promise<void> {
  await subscriber.subscribe(channel)
  subscriber.on('message', (ch: string, message: string) => {
    if (ch === channel) {
      try {
        handler(JSON.parse(message))
      } catch {
        handler(message)
      }
    }
  })
}

export async function pushJob(queue: string, data: unknown): Promise<void> {
  await redis.rpush(queue, JSON.stringify(data))
}

export async function popJob<T = unknown>(queue: string, timeoutSec = 5): Promise<T | null> {
  const result = await redis.blpop(queue, timeoutSec)
  if (!result) return null
  return JSON.parse(result[1]) as T
}

export async function closeRedis(): Promise<void> {
  await subscriber.quit()
  await redis.quit()
}
