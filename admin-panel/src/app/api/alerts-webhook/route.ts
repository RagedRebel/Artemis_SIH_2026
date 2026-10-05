import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { v4 as uuid } from 'uuid'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const alert = Array.isArray(body) ? body[0] : (body.parameters?.alert || body)

    if (!alert || !alert.rule) {
      return NextResponse.json({ status: 'ignored', reason: 'no rule' })
    }

    const id = uuid()
    const timestamp = new Date().toISOString()
    
    // wazuh alert format mapping
    const agentId = alert.agent?.id || '000'
    const agentName = alert.agent?.name || 'unknown'
    const ruleId = parseInt(alert.rule?.id || '0', 10)
    const ruleDesc = alert.rule?.description || 'Unknown event'
    const mitre = alert.rule?.mitre ? { id: alert.rule.mitre.id?.[0], tactic: alert.rule.mitre.tactic?.[0] } : null
    const severity = parseInt(alert.rule?.level || '1', 10)

    const srcIp = alert.agent?.ip || alert.data?.srcip || null
    const dstIp = alert.data?.destip || null

    await db.query(
      `INSERT INTO siem_alerts 
        (id, timestamp, agent_id, agent_name, rule_id, rule_description, rule_mitre, severity, src_ip, dst_ip, raw_log)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
      [
        id, timestamp, agentId, agentName, ruleId, ruleDesc, 
        JSON.stringify(mitre ? [mitre] : []), 
        severity, srcIp, dstIp, JSON.stringify(alert)
      ]
    )

    return NextResponse.json({ status: 'ok', id })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
