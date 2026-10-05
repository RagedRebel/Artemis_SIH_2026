import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })
import { setupTelemetry } from '../shared/telemetry.js'
setupTelemetry('campaign-handler');
// Do not exit the process on stray rejections — that leaves Redis jobs stuck and campaigns "queued" forever.
// Log loudly so you can fix the root cause without killing the consumer loop.
process.on('uncaughtException', (err) => {
  console.error(`[campaign_handler] Uncaught exception (process continues): ${err.stack ?? err}`)
})

process.on('unhandledRejection', (reason) => {
  console.error(`[campaign_handler] Unhandled rejection (process continues): ${reason}`)
})

const [
  { InMemoryRunner },
  { createUserContent },
  { orchestratorAgent },
  { createLogger },
  redisMod,
  { db },
] = await Promise.all([
  import('@google/adk'),
  import('@google/genai'),
  import('./index.js'),
  import('../shared/logger.js'),
  import('../shared/redis-client.js'),
  import('../shared/db-client.js'),
])

const { popJob, publish, subscribe } = redisMod

const logger = createLogger('campaign_handler')

const MAX_RETRIES = 5
const BASE_RETRY_MS = 65_000

const activeCampaigns = new Map<string, AbortController>()

function parseRetryDelay(msg: string): number {
  const match = /retry in ([\d.]+)s/i.exec(msg)
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 2000
  return BASE_RETRY_MS
}

function isContextWindowError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    lower.includes('context window') ||
    lower.includes('context length') ||
    lower.includes('token limit') ||
    lower.includes('maximum context') ||
    lower.includes('too many tokens') ||
    lower.includes('exceeds the model') ||
    lower.includes('input too long') ||
    lower.includes('request payload size exceeds') ||
    lower.includes('total token count') ||
    lower.includes('content too large') ||
    lower.includes('prompt is too long') ||
    lower.includes('num_ctx') ||
    lower.includes('exceeds context') ||
    lower.includes('requires more context') ||
    lower.includes('context size') ||
    lower.includes('model context') ||
    (lower.includes('request too large') && !lower.includes('429'))
  )
}

function isRateLimitError(msg: string, code: string | number | undefined): boolean {
  if (String(code ?? '') === '429') return true
  const lower = msg.toLowerCase()
  return (
    lower.includes('exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too many requests')
  )
}

function isAccountLimitError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    lower.includes('usage limit') ||
    lower.includes('upgrade for higher limits') ||
    lower.includes('billing') ||
    lower.includes('quota') ||
    lower.includes('plan limit') ||
    lower.includes('subscription')
  )
}

function isFatalApiError(msg: string, code: string | number | undefined): boolean {
  if (isContextWindowError(msg)) return true
  if (isAccountLimitError(msg)) return true
  const c = String(code ?? '')
  if (c === '400' || c === '403' || c === '404') return true
  return false
}

const CONSECUTIVE_ERROR_LIMIT = 5

async function markCampaignFailed(campaignId: string, errorMessage: string) {
  await db.query(
    `UPDATE campaigns SET status = 'failed', ended_at = NOW(), error_message = $1 WHERE id = $2`,
    [errorMessage, campaignId]
  )
  await publish('campaign_status', {
    campaignId,
    status: 'failed',
    message: errorMessage,
  })
  activeCampaigns.delete(campaignId)
  logger.error(`Campaign ${campaignId} marked FAILED: ${errorMessage}`)
}

async function markCampaignAborted(campaignId: string) {
  await db.query(
    `UPDATE campaigns SET status = 'aborted', ended_at = NOW(), error_message = 'Aborted by user' WHERE id = $1`,
    [campaignId]
  )
  await publish('campaign_status', {
    campaignId,
    status: 'aborted',
    message: 'Campaign aborted by user',
  })
  activeCampaigns.delete(campaignId)
  logger.info(`Campaign ${campaignId} ABORTED by user`)
}

async function processCampaignRequest(
  runner: InstanceType<typeof InMemoryRunner>,
  campaign: {
    campaignId?: string
    name: string
    targetScope: string[]
    maxRiskLevel: string
    enableCveTesting: boolean
  }
) {
  logger.info(`Processing campaign: ${campaign.name}`, {
    scope: campaign.targetScope,
    campaignId: campaign.campaignId,
  })

  const cid = campaign.campaignId?.trim()
  const idLine = cid
    ? `- Campaign ID (already in PostgreSQL, queued from admin): **${cid}** — use this **campaignId** on create_campaign adoption, update_campaign, close_campaign, and tell sub-agents to pass it to report_finding and other tools.`
    : ''

  const abortController = new AbortController()
  if (cid) activeCampaigns.set(cid, abortController)

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (abortController.signal.aborted) {
        if (cid) await markCampaignAborted(cid)
        return
      }

      const session = await runner.sessionService.createSession({
        appName: 'artemis',
        userId: 'system',
      })
      logger.info(`Attempt ${attempt}/${MAX_RETRIES} — session: ${session.id}`)

      const message = createUserContent(
        `Start a new security assessment campaign with the following parameters:
- Name: ${campaign.name}
- Target Scope: ${campaign.targetScope.join(', ')}
- Max Risk Level: ${campaign.maxRiskLevel}
- CVE Testing: ${campaign.enableCveTesting ? 'enabled' : 'disabled'}
${idLine}

VERY IMPORTANT INSTRUCTION REGARDING CAMPAIGN ID:
Whenever you call a tool (like search_exploitdb, search_github_poc, nmap_scan, gobuster_scan, web_tech_detect, etc) or whenever you ask a sub-agent to do anything, you MUST pass/instruct them to use the campaignId: "${cid}".
If a tool accepts \`campaignId\`, provide it. Do NOT leave it empty.

Execute the full campaign workflow: run CVE intelligence, then perform penetration testing on all targets in scope. Monitor blue team detections throughout.
The campaign is ALREADY CREATED and MARKED RUNNING. DO NOT call create_campaign() or update_campaign() to start it.
When everything is fully finished, call close_campaign() with a detailed summary.

IMPORTANT: You MUST use your tools. Start by delegating to your sub-agents using the agent tools. Do NOT just respond with text.`
      )

      logger.info('Sending message to orchestrator agent...')
      let eventCount = 0
      let toolCallCount = 0
      let rateLimited = false
      let fatalError: string | null = null
      let retryDelay = BASE_RETRY_MS
      let consecutiveErrors = 0
      const startTime = Date.now()

      try {
        for await (const event of runner.runAsync({
          userId: session.userId,
          sessionId: session.id,
          newMessage: message,
        })) {
          if (abortController.signal.aborted) {
            logger.info(`Campaign "${campaign.name}" abort signal received mid-stream`)
            break
          }

          eventCount++
          const author = event.author ?? 'unknown'
          const invId = event.invocationId ?? ''

          const ev = event as unknown as Record<string, unknown>
          if (ev.errorCode || ev.errorMessage) {
            const msg = String(ev.errorMessage ?? '')
            const code = ev.errorCode
            logger.error(`[${author}] API ERROR: code=${code} msg=${msg}`)

            if (isFatalApiError(msg, code as string | number | undefined)) {
              const reason = isContextWindowError(msg)
                ? 'Context window exceeded — the agent conversation grew too large for the model.'
                : `Fatal API error (code=${code}): ${msg.slice(0, 500)}`
              fatalError = reason
              break
            }

            if (isRateLimitError(msg, code as string | number | undefined)) {
              rateLimited = true
              retryDelay = parseRetryDelay(msg)
            } else {
              consecutiveErrors++
              if (consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
                fatalError = `Too many consecutive API errors (${consecutiveErrors}): last error code=${code}, msg=${msg.slice(0, 300)}`
                break
              }
            }
            continue
          }

          if (event.content?.parts?.length) {
            consecutiveErrors = 0
            for (const part of event.content.parts) {
              if ('text' in part && part.text) {
                logger.info(`[${author}] ${part.text}`)
              }
              if ('functionCall' in part && part.functionCall) {
                toolCallCount++
                const fc = part.functionCall as { name: string; args?: Record<string, unknown> }
                logger.info(`[${author}] TOOL CALL → ${fc.name}(${JSON.stringify(fc.args ?? {}).slice(0, 200)})`)
              }
              if ('functionResponse' in part && part.functionResponse) {
                const fr = part.functionResponse as { name: string; response?: unknown }
                const respStr = JSON.stringify(fr.response ?? {}).slice(0, 300)
                logger.info(`[${author}] TOOL RESULT ← ${fr.name}: ${respStr}`)
              }
            }
          }

          if (event.actions) {
            const actions = event.actions as unknown as Record<string, unknown>
            if (actions.transferToAgent) {
              logger.info(`[${author}] TRANSFER → agent: ${actions.transferToAgent}`)
            }
          }

          if (eventCount % 10 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            logger.info(`Progress: ${eventCount} events, ${elapsed}s elapsed (invocation: ${invId})`)
          }
        }
      } catch (err) {
        const errMsg = (err as Error).message ?? String(err)
        if (isContextWindowError(errMsg)) {
          fatalError = 'Context window exceeded — the agent conversation grew too large for the model.'
        } else {
          fatalError = `Unhandled runner error: ${errMsg.slice(0, 500)}`
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

      if (abortController.signal.aborted) {
        if (cid) await markCampaignAborted(cid)
        return
      }

      if (fatalError) {
        if (cid) await markCampaignFailed(cid, fatalError)
        return
      }

      if (!rateLimited) {
        if (toolCallCount === 0 && eventCount <= 3) {
          const msg = `Campaign produced no tool calls (${eventCount} event(s) in ${totalTime}s) — the LLM failed to act. Check model availability and logs.`
          if (cid) await markCampaignFailed(cid, msg)
        } else {
          logger.info(`Campaign "${campaign.name}" complete — ${eventCount} events, ${toolCallCount} tool calls in ${totalTime}s`)
          if (cid) activeCampaigns.delete(cid)
        }
        return
      }

      if (attempt < MAX_RETRIES) {
        const waitSec = Math.ceil(retryDelay / 1000)
        logger.warn(
          `Campaign "${campaign.name}" hit 429 on attempt ${attempt}. ` +
            `Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`,
        )
        await new Promise(r => setTimeout(r, retryDelay))
      } else {
        const msg = `Campaign failed after ${MAX_RETRIES} attempts due to persistent API rate limits.`
        if (cid) await markCampaignFailed(cid, msg)
      }
    }
  } finally {
    if (cid) activeCampaigns.delete(cid)
  }
}

async function main() {
  logger.info('Starting ARTEMIS Campaign Handler — BLPOP on queue:campaign_requests', {
    redis: process.env.REDIS_URL?.replace(/:[^:@/]+@/, ':****@') ?? '(default localhost)',
    hint: 'If campaigns stay queued, ensure this process is running (host: npm run start:agents, Docker: agents service).',
  })

  const runner = new InMemoryRunner({
    agent: orchestratorAgent,
    appName: 'artemis',
  })
  logger.info('InMemoryRunner created')

  await subscribe('campaign_abort', (data: unknown) => {
    const { campaignId } = data as { campaignId: string }
    if (!campaignId) return
    const controller = activeCampaigns.get(campaignId)
    if (controller) {
      logger.info(`Abort signal received for campaign ${campaignId}`)
      controller.abort()
    } else {
      logger.warn(`Abort signal for campaign ${campaignId} but no active runner found`)
    }
  })
  logger.info('Subscribed to campaign_abort channel')

  logger.info('Entering job loop...')
  while (true) {
    try {
      const job = await popJob<{
        campaignId?: string
        name: string
        targetScope: string[]
        maxRiskLevel: string
        enableCveTesting: boolean
      }>('queue:campaign_requests', 5)

      if (job) {
        logger.info(`Job received: ${JSON.stringify(job)}`)
        const cid = job.campaignId?.trim()
        const previousActive = process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID
        try {
          if (cid) {
            process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID = cid
            await db.query(
              `UPDATE campaigns
               SET status = 'running', started_at = COALESCE(started_at, NOW()), max_risk_level = COALESCE($2::text, max_risk_level)
               WHERE id = $1`,
              [cid, job.maxRiskLevel]
            )
            await publish('campaign_status', {
              campaignId: cid,
              status: 'running',
              message: `Campaign "${job.name}" picked up from Redis queue`,
            })
            logger.info('Marked campaign running', { campaignId: cid })
          }
          await processCampaignRequest(runner, job)
        } finally {
          if (cid) {
            if (previousActive !== undefined && previousActive.length > 0) {
              process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID = previousActive
            } else {
              delete process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID
            }
          }
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message ?? String(err)
      logger.error('Campaign handler error', { error: errMsg, stack: (err as Error).stack })
      const failedCid = process.env.ARTEMIS_ACTIVE_CAMPAIGN_ID?.trim()
      if (failedCid) {
        try {
          await markCampaignFailed(failedCid, `Campaign handler crash: ${errMsg.slice(0, 500)}`)
        } catch (markErr) {
          logger.error('Failed to mark campaign as failed', { error: String(markErr) })
        }
      }
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

main().catch((err) => {
  console.error(`Campaign handler fatal: ${(err as Error).stack ?? err}`)
  process.exit(1)
})
