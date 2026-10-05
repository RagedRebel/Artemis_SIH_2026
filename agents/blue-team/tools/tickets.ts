import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { publish } from '../../shared/redis-client.js'
import { createLogger } from '../../shared/logger.js'
import { v4 as uuid } from 'uuid'

const logger = createLogger('blue_team_agent')

export const createIncidentTicketTool = new FunctionTool({
  name: 'create_incident_ticket',
  description: 'Open an incident ticket in pending_verification status. The ticket is NOT pushed to JIRA/Slack yet — call verify_incident next to confirm true positive (which triggers external sync) or downgrade to false positive.',
  parameters: z.object({
    title: z.string().describe('Short incident title'),
    description: z.string().describe('Detailed description including analysis reasoning'),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).describe('Incident severity'),
    alertIds: z.array(z.string()).describe('Array of correlated alert IDs'),
    mitreTechniques: z.array(z.string()).describe('MITRE ATT&CK technique IDs'),
    affectedHosts: z.array(z.string()).describe('Affected host IPs or hostnames'),
  }),
  execute: async ({ title, description, severity, alertIds, mitreTechniques, affectedHosts }) => {
    const start = Date.now()
    const incidentId = uuid()

    await db.query(
      `INSERT INTO incidents (id, title, description, severity, status, alert_ids, mitre_techniques, affected_hosts, created_at)
       VALUES ($1, $2, $3, $4, 'pending_verification', $5, $6, $7, NOW())`,
      [incidentId, title, description, severity, alertIds, mitreTechniques, affectedHosts]
    )

    await publish('incident_pending_verification', { incidentId, title, severity, affectedHosts })
    await logger.audit('create_incident_ticket', { title, severity, alertCount: alertIds.length }, { incidentId, status: 'pending_verification' }, Date.now() - start)

    return { incidentId, status: 'pending_verification', next: 'Call verify_incident(incidentId) with corroborating evidence.' }
  },
})

export const verifyIncidentTool = new FunctionTool({
  name: 'verify_incident',
  description: `Confirm a pending incident as a verified true positive (publishes to JIRA/Slack) or downgrade to false_positive.
Verification MUST cite specific corroborating signals: related agent_id alerts in the same window, behavioral anomalies on the same agent, MITRE chain length, FIM/syscollector deltas. A bare severity threshold is NOT verification.`,
  parameters: z.object({
    incidentId: z.string().describe('UUID of the pending incident'),
    verdict: z.enum(['verified', 'false_positive']),
    corroboratingSignals: z.array(z.string()).describe(
      'Specific signals: e.g. "3 related alerts on same agent within 5min", "behavioral_anomaly:powershell_spawning_rundll32 on same agent", "MITRE chain T1059 -> T1055 -> T1003"'
    ),
    behavioralAnomalies: z.array(z.record(z.string(), z.unknown())).optional().describe(
      'Anomaly objects from analyze_agent_behavior() that strengthened the verdict'
    ),
    reasoning: z.string().describe('Why this verdict was chosen — the chain of inference'),
  }),
  execute: async ({ incidentId, verdict, corroboratingSignals, behavioralAnomalies, reasoning }) => {
    const start = Date.now()

    const cur = await db.query(
      'SELECT id, title, severity, affected_hosts, status FROM incidents WHERE id = $1',
      [incidentId]
    )
    if (cur.rows.length === 0) {
      return { error: `Incident ${incidentId} not found` }
    }
    const row = cur.rows[0]
    if (row.status !== 'pending_verification') {
      return { error: `Incident is in status '${row.status}'; cannot verify` }
    }

    const verificationEvidence = {
      reasoning,
      corroboratingSignals,
      verifiedAt: new Date().toISOString(),
    }

    await db.query(
      `UPDATE incidents
       SET status = $1,
           verification_evidence = $2,
           behavioral_anomalies = $3
       WHERE id = $4`,
      [
        verdict,
        JSON.stringify(verificationEvidence),
        JSON.stringify(behavioralAnomalies ?? []),
        incidentId,
      ]
    )

    if (verdict === 'verified') {
      await publish('new_incident', { incidentId, title: row.title, severity: row.severity, affectedHosts: row.affected_hosts })
    }

    await logger.audit('verify_incident', { incidentId, verdict }, { incidentId, verdict }, Date.now() - start)

    return { incidentId, status: verdict }
  },
})
