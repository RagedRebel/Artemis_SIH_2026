import Redis from 'ioredis'
import { syncIncidentToJira } from './jira-sync'
import { notifySlackIncident, notifySlackApproval } from './slack-notify'
import { syncFindingToJira, notifySlackFinding } from './finding-sync'
import { db } from '../db'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let initialized = false

export function startIntegrationDispatcher() {
  if (initialized) return
  initialized = true

  console.log('[integrations] Starting dispatcher... Redis URL:', REDIS_URL)

  const subscriber = new Redis(REDIS_URL)

  subscriber.on('error', (err: Error) => {
    console.error('[integrations] Redis subscriber error:', err.message)
  })

  subscriber.on('connect', () => {
    console.log('[integrations] Redis subscriber connected')
  })

  subscriber
    .subscribe('new_incident', 'approval_queue', 'new_finding', 'finding_needs_review')
    .then(() => {
      console.log('[integrations] Dispatcher listening on: new_incident, approval_queue, new_finding, finding_needs_review')
    })
    .catch((err: unknown) => {
      console.error('[integrations] Failed to subscribe:', err)
    })

  subscriber.on('message', async (channel: string, message: string) => {
    console.log(`[integrations] Received message on channel: ${channel}`)
    try {
      const data = JSON.parse(message)

      if (channel === 'new_incident') {
        console.log('[integrations] Processing new_incident:', data.incidentId)
        await handleNewIncident(data)
        console.log('[integrations] new_incident processed successfully')
      } else if (channel === 'approval_queue') {
        console.log('[integrations] Processing approval_queue:', data.approvalId)
        await handleApprovalRequest(data)
        console.log('[integrations] approval_queue processed successfully')
      } else if (channel === 'new_finding') {
        console.log('[integrations] Processing new_finding:', data.findingId)
        await handleVerifiedFinding(data)
        console.log('[integrations] new_finding processed successfully')
      } else if (channel === 'finding_needs_review') {
        console.log('[integrations] Processing finding_needs_review:', data.findingId)
        await handleFindingNeedsReview(data)
        console.log('[integrations] finding_needs_review processed successfully')
      }
    } catch (err) {
      console.error(`[integrations] Error handling ${channel}:`, err)
    }
  })
}

async function handleVerifiedFinding(data: { findingId: string }) {
  if (!data?.findingId) return
  await syncFindingToJira(data.findingId)
  await notifySlackFinding(data.findingId, 'verified')
}

async function handleFindingNeedsReview(data: { findingId: string }) {
  if (!data?.findingId) return
  await notifySlackFinding(data.findingId, 'needs_review')
}

async function handleNewIncident(data: {
  incidentId: string
  title: string
  severity: string
  affectedHosts: string[]
}) {
  await syncIncidentToJira(data.incidentId)

  const incidentRow = await db.query(
    `SELECT id, title, description, severity, affected_hosts FROM incidents WHERE id = $1`,
    [data.incidentId]
  )
  const incident = incidentRow.rows[0]
  if (!incident) return

  await notifySlackIncident({
    id: incident.id,
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    affectedHosts: incident.affected_hosts ?? [],
  })
}

async function handleApprovalRequest(data: {
  approvalId: string
  agentName: string
  actionDescription: string
  command: string
  riskLevel: string
  campaignId: string
}) {
  await notifySlackApproval({
    approvalId: data.approvalId,
    agentName: data.agentName,
    actionDescription: data.actionDescription,
    command: data.command,
    riskLevel: data.riskLevel,
    campaignId: data.campaignId,
  })
}
