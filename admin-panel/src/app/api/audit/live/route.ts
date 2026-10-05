import { NextRequest } from 'next/server'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaignId')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = new Redis(REDIS_URL)

      subscriber.subscribe('audit_stream').catch(() => {})

      subscriber.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message)
          if (campaignId && data.campaign_id !== campaignId) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Skip malformed messages
        }
      })

      // Heartbeat
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        subscriber.quit().catch(() => {})
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
