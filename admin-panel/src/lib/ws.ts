import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const CHANNELS = [
  'agent_events',
  'new_finding',
  'approval_queue',
  'approval_response',
  'alert_stream',
  'new_incident',
  'campaign_status',
  'cve_queue_update',
]

export function createRedisSubscriber(onMessage: (channel: string, data: unknown) => void) {
  const subscriber = new Redis(REDIS_URL)

  subscriber.on('error', (err) => {
    console.error('Redis subscriber error:', err)
  })

  for (const channel of CHANNELS) {
    subscriber.subscribe(channel).catch(err => {
      console.error(`Failed to subscribe to ${channel}:`, err)
    })
  }

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message)
      onMessage(channel, data)
    } catch {
      onMessage(channel, message)
    }
  })

  return subscriber
}
