import 'dotenv/config'
import { InMemoryRunner } from '@google/adk'
import { createUserContent } from '@google/genai'
import { redTeamAgent } from './index.js'
import { createLogger } from '../shared/logger.js'

const logger = createLogger('red_team_runner')

async function main() {
  logger.info('Starting Red Team Agent standalone runner')

  const runner = new InMemoryRunner({
    agent: redTeamAgent,
    appName: 'artemis-redteam',
  })

  const session = await runner.sessionService.createSession({
    appName: 'artemis-redteam',
    userId: 'test-user',
  })

  const target = process.argv[2] ?? '172.30.0.10'
  const message = `Perform a full penetration test against target: ${target}. Campaign ID: test-campaign-001.`

  const userContent = createUserContent(message)

  for await (const event of runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage: userContent,
  })) {
    if (event.content?.parts?.length) {
      for (const part of event.content.parts) {
        if ('text' in part && part.text) {
          logger.info(`Red Team: ${part.text}`)
        }
      }
    }
  }

  logger.info('Red Team Agent run complete')
}

main().catch((err) => {
  logger.error('Red Team runner failed', { error: String(err) })
  process.exit(1)
})
