export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { AlertConsole } from '@/components/alert-console'
import { AppPageHeader } from '@/components/app-page-header'
import { Card, CardContent } from '@/components/ui/card'

async function getAlerts() {
  try {
    const result = await db.query(
      `SELECT id, timestamp, agent_name, rule_description, severity, src_ip, rule_mitre, ai_triage
       FROM siem_alerts ORDER BY timestamp DESC LIMIT 200`
    )
    return result.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      agentName: r.agent_name,
      ruleDescription: r.rule_description,
      severity: r.severity,
      srcIp: r.src_ip,
      ruleMitre: r.rule_mitre,
      aiTriage: r.ai_triage,
    }))
  } catch {
    return []
  }
}

export default async function AlertsPage() {
  const alerts = await getAlerts()

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Operations"
        title="SIEM alerts"
        description="Wazuh-derived alert stream with AI triage hints. Use Wazuh SIEM for the full dashboard."
      />

      {alerts.length === 0 ? (
        <Card className="border-dashed border-zinc-300/90 bg-white/80">
          <CardContent className="py-14 text-center">
            <p className="text-base font-medium text-zinc-700">No alerts to display</p>
            <p className="mt-2 max-w-sm mx-auto text-sm text-zinc-500">
              Alerts appear here when Wazuh forwards events into ARTEMIS.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AlertConsole alerts={alerts} />
      )}
    </div>
  )
}
