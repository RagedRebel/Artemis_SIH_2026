import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { setupTelemetry } from '../shared/telemetry.js'
setupTelemetry('blue-team');

if (process.env.WAZUH_VERIFY_SSL === 'false') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const [{ InMemoryRunner }, { createUserContent }, { blueTeamAgent }, { createLogger }] =
  await Promise.all([
    import('@google/adk'),
    import('@google/genai'),
    import('./index.js'),
    import('../shared/logger.js'),
  ])

const logger = createLogger('blue_team_runner')
const BASE_POLL_MS = parseInt(process.env.BLUE_TEAM_POLL_SECONDS ?? '300', 10) * 1000
const MAX_BACKOFF_MS = 15 * 60 * 1000 // 15 minutes max

async function runMonitoringCycle(
  runner: InstanceType<typeof InMemoryRunner>,
): Promise<boolean> {
  const session = await runner.sessionService.createSession({
    appName: 'artemis-blueteam',
    userId: 'system',
  })

  const message = createUserContent(
    'Run a monitoring cycle: drain the Redis alerts, fetch recent Wazuh alerts (severity >= 6, latest), correlate them, classify incidents, and suggest detection improvements.'
  )        

  let hitRateLimit = false

  for await (const event of runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage: message,
  })) {
    if (event.errorCode === '429' || event.errorMessage?.includes('exhausted')) {
      hitRateLimit = true
      logger.warn('Gemini API rate limit hit, will back off')
      continue
    }

    if (event.content?.parts?.length) {
      for (const part of event.content.parts) {
        if ('text' in part && part.text) {
          logger.info(`Blue Team: ${part.text}`)
        }
      }
    }
  }

  return hitRateLimit
}

async function main() {
  logger.info(`Starting Blue Team Agent — monitoring every ${BASE_POLL_MS / 1000}s`)

  const runner = new InMemoryRunner({
    agent: blueTeamAgent,
    appName: 'artemis-blueteam',
  })

  let currentDelay = BASE_POLL_MS

  while (true) {
    try {
      const rateLimited = await runMonitoringCycle(runner)
      if (rateLimited) {
        currentDelay = Math.min(currentDelay * 2, MAX_BACKOFF_MS)
        logger.warn(`Rate limited — backing off to ${currentDelay / 1000}s`)
      } else {
        currentDelay = BASE_POLL_MS
      }
    } catch (err) {
      logger.error('Monitoring cycle failed', { error: String(err) })
      currentDelay = Math.min(currentDelay * 2, MAX_BACKOFF_MS)
    }
    await new Promise(r => setTimeout(r, currentDelay))
  }
}

main().catch((err) => {
  logger.error('Blue Team runner failed', { error: String(err) })
  process.exit(1)
})
