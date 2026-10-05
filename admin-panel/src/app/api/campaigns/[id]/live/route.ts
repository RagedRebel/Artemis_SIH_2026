import { NextRequest } from 'next/server'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = new Redis(REDIS_URL)
      const channels = ['agent_events', 'new_finding', 'campaign_status', 'approval_queue']

      for (const ch of channels) {
        subscriber.subscribe(ch).catch(() => {})
      }

      subscriber.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message)
          if (data.campaignId && data.campaignId !== campaignId) return

          const event = {
            timestamp: new Date().toISOString(),
            agent: data.agentName ?? data.agent ?? 'system',
            type: _channel === 'new_finding' ? 'finding' :
                  _channel === 'approval_queue' ? 'info' :
                  _channel === 'campaign_status' ? 'info' : 'output',
            content: data.message ?? data.title ?? JSON.stringify(data),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Skip malformed messages
        }
      })

      const heartbeat = setInterval(() => {
        const event = {
          timestamp: new Date().toISOString(),
          agent: 'system',
          type: 'info',
          content: 'heartbeat',
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
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
