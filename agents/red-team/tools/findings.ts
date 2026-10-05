import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import { publish } from '../../shared/redis-client.js'
import { createLogger } from '../../shared/logger.js'
import { v4 as uuid } from 'uuid'

const logger = createLogger('red_team_agent')

export const reportFindingTool = new FunctionTool({
  name: 'report_finding',
  description: 'Record a discovered vulnerability as a Finding in pending_verification status. The finding is NOT sent to JIRA yet — call verify_finding next to confirm or escalate to manual review.',
  parameters: z.object({
    campaignId: z.string().describe('Campaign ID this finding belongs to'),
    title: z.string().describe('Short title of the vulnerability'),
    affectedHost: z.string().describe('IP or hostname of the affected system'),
    affectedService: z.string().describe("Affected service e.g. 'Apache 2.4.49:443'"),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).describe('Severity classification'),
    cvssScore: z.number().describe('CVSS base score (0-10)'),
    description: z.string().describe('Detailed description of the vulnerability'),
    evidence: z.record(z.string(), z.unknown()).describe('Evidence from the tool output (tool output, proof, etc.)'),
    remediation: z.string().describe('Specific, actionable remediation steps'),
    cveId: z.string().optional().describe('CVE identifier if applicable'),
  }),
  execute: async ({ campaignId, title, affectedHost, affectedService, severity, cvssScore, description, evidence, remediation, cveId }) => {
    const start = Date.now()
    const findingId = uuid()

    await db.query(
      `INSERT INTO findings
       (id, campaign_id, cve_id, title, description, affected_host, affected_service,
        cvss_score, severity, evidence, remediation, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_verification',NOW())`,
      [
        findingId, campaignId, cveId ?? null,
        title, description, affectedHost,
        affectedService, cvssScore, severity,
        JSON.stringify(evidence), remediation,
      ]
    )

    await db.query(
      'UPDATE campaigns SET findings_count = findings_count + 1 WHERE id = $1',
      [campaignId]
    )

    await publish('finding_pending_verification', { findingId, severity, host: affectedHost, title })
    await logger.audit('report_finding', { title, affectedHost, severity, cvssScore }, { findingId, status: 'pending_verification' }, Date.now() - start, campaignId)

    return { findingId, status: 'pending_verification', next: 'Call verify_finding(findingId) with re-test evidence.' }
  },
})

export const verifyFindingTool = new FunctionTool({
  name: 'verify_finding',
  description: 'Confirm a pending finding as a true positive (verified) or escalate to manual pentester review (needs_manual_review). Only verified findings create JIRA tickets.',
  parameters: z.object({
    findingId: z.string().describe('UUID of the pending finding'),
    verdict: z.enum(['verified', 'needs_manual_review']).describe(
      'verified = exploit/repro succeeded a second time; needs_manual_review = scanner-only or inconsistent re-test'
    ),
    retestEvidence: z.record(z.string(), z.unknown()).describe(
      'Evidence from the second test run: command, full output, and explicit indicator that confirmed (e.g. shell output, file contents read, second nuclei hit)'
    ),
    reasoning: z.string().describe('Why this verdict was chosen — what specifically confirmed or could not confirm'),
  }),
  execute: async ({ findingId, verdict, retestEvidence, reasoning }) => {
    const start = Date.now()

    const cur = await db.query(
      'SELECT id, campaign_id, severity, affected_host, title, status FROM findings WHERE id = $1',
      [findingId]
    )
    if (cur.rows.length === 0) {
      return { error: `Finding ${findingId} not found` }
    }
    const row = cur.rows[0]
    if (row.status !== 'pending_verification' && row.status !== 'needs_manual_review') {
      return { error: `Finding is in status '${row.status}'; cannot verify` }
    }

    const verificationEvidence = { reasoning, retest: retestEvidence, verifiedAt: new Date().toISOString() }

    await db.query(
      `UPDATE findings
       SET status = $1,
           verification_attempts = verification_attempts + 1,
           verification_evidence = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [verdict, JSON.stringify(verificationEvidence), findingId]
    )

    if (verdict === 'verified') {
      await publish('new_finding', { findingId, severity: row.severity, host: row.affected_host, title: row.title })
    } else {
      await publish('finding_needs_review', { findingId, severity: row.severity, host: row.affected_host, title: row.title, reasoning })
    }

    await logger.audit('verify_finding', { findingId, verdict }, { findingId, verdict }, Date.now() - start, row.campaign_id)

    return { findingId, status: verdict }
  },
})

export const markFalsePositiveTool = new FunctionTool({
  name: 'mark_false_positive',
  description: 'Self-correct: a previously reported finding turned out to be false (e.g. response did not actually contain injection marker, scanner mis-fingerprinted version). Closes the finding without raising a ticket.',
  parameters: z.object({
    findingId: z.string().describe('UUID of the finding to mark false positive'),
    reasoning: z.string().describe('Why this is a false positive — what disproved it'),
  }),
  execute: async ({ findingId, reasoning }) => {
    const start = Date.now()

    const cur = await db.query('SELECT id, campaign_id FROM findings WHERE id = $1', [findingId])
    if (cur.rows.length === 0) {
      return { error: `Finding ${findingId} not found` }
    }

    await db.query(
      `UPDATE findings
       SET status = 'false_positive',
           verification_attempts = verification_attempts + 1,
           verification_evidence = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ reasoning, markedAt: new Date().toISOString() }), findingId]
    )

    await db.query(
      'UPDATE campaigns SET findings_count = GREATEST(findings_count - 1, 0) WHERE id = $1',
      [cur.rows[0].campaign_id]
    )

    await logger.audit('mark_false_positive', { findingId, reasoning }, { findingId }, Date.now() - start, cur.rows[0].campaign_id)

    return { findingId, status: 'false_positive' }
  },
})
