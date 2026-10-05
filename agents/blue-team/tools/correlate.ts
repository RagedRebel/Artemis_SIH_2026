import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('blue_team_agent')

interface AlertForCorrelation {
  id: string
  srcIp?: string
  ruleId: number
  ruleDescription: string
  severity: number
  timestamp: string
  mitre?: { id: string; tactic: string; technique: string }[]
}

export const correlateEventsTool = new FunctionTool({
  name: 'correlate_events',
  description: 'Group related SIEM alerts by ATT&CK technique, source IP, or timeframe to identify attack patterns.',
  parameters: z.object({
    alerts: z.array(z.object({
      id: z.string(),
      srcIp: z.string().optional(),
      ruleId: z.number(),
      ruleDescription: z.string(),
      severity: z.number(),
      timestamp: z.string(),
      mitre: z.array(z.object({
        id: z.string(),
        tactic: z.string(),
        technique: z.string(),
      })).optional(),
    })).describe('Array of alerts to correlate'),
    windowMinutes: z.number().optional().describe('Time window for correlation in minutes (default 5)'),
  }),
  execute: async ({ alerts, windowMinutes }) => {
    const start = Date.now()
    const window = (windowMinutes ?? 5) * 60 * 1000

    const bySourceIp: Record<string, AlertForCorrelation[]> = {}
    const byMitreTechnique: Record<string, AlertForCorrelation[]> = {}

    for (const alert of alerts) {
      if (alert.srcIp) {
        bySourceIp[alert.srcIp] ??= []
        bySourceIp[alert.srcIp].push(alert)
      }
      for (const m of alert.mitre ?? []) {
        byMitreTechnique[m.id] ??= []
        byMitreTechnique[m.id].push(alert)
      }
    }

    const correlatedGroups = []

    for (const [ip, ipAlerts] of Object.entries(bySourceIp)) {
      if (ipAlerts.length >= 2) {
        const timestamps = ipAlerts.map(a => new Date(a.timestamp).getTime())
        const span = Math.max(...timestamps) - Math.min(...timestamps)
        if (span <= window) {
          correlatedGroups.push({
            type: 'source_ip_cluster',
            key: ip,
            alertCount: ipAlerts.length,
            maxSeverity: Math.max(...ipAlerts.map(a => a.severity)),
            alertIds: ipAlerts.map(a => a.id),
            techniques: [...new Set(ipAlerts.flatMap(a => a.mitre?.map(m => m.id) ?? []))],
            timeSpanMs: span,
          })
        }
      }
    }

    for (const [technique, techAlerts] of Object.entries(byMitreTechnique)) {
      if (techAlerts.length >= 2) {
        correlatedGroups.push({
          type: 'mitre_technique_cluster',
          key: technique,
          alertCount: techAlerts.length,
          maxSeverity: Math.max(...techAlerts.map(a => a.severity)),
          alertIds: techAlerts.map(a => a.id),
          sourceIps: [...new Set(techAlerts.map(a => a.srcIp).filter(Boolean))],
        })
      }
    }

    await logger.audit('correlate_events', { alertCount: alerts.length, windowMinutes }, { groupsFound: correlatedGroups.length }, Date.now() - start)

    return { correlatedGroups, totalAlerts: alerts.length }
  },
})
