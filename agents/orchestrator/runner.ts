import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

const [{ InMemoryRunner }, { createUserContent }, { orchestratorAgent }, { createLogger }] =
  await Promise.all([
    import('@google/adk'),
    import('@google/genai'),
    import('./index.js'),
    import('../shared/logger.js'),
  ])

const logger = createLogger('orchestrator_runner')

async function main() {
  logger.info('Starting ARTEMIS Orchestrator Agent')

  const runner = new InMemoryRunner({
    agent: orchestratorAgent,
    appName: 'artemis',
  })

  const session = await runner.sessionService.createSession({
    appName: 'artemis',
    userId: 'system',
  })

  logger.info(`Session created: ${session.id}`)

  const args = process.argv.slice(2)
  const message = args.join(' ') || 'System ready. Awaiting campaign instructions.'

  const userContent = createUserContent(message)

  logger.info(`Sending message: ${message}`)

  for await (const event of runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage: userContent,
  })) {
    if (event.content?.parts?.length) {
      for (const part of event.content.parts) {
        if ('text' in part && part.text) {
          logger.info(`Agent response: ${part.text}`)
        }
      }
    }
  }

  logger.info('Orchestrator run complete')
}

main().catch((err) => {
  logger.error('Orchestrator failed', { error: String(err) })
  process.exit(1)
})
