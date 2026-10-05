import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { updateSlackApprovalMessage } from '@/lib/integrations/slack-notify'
import crypto from 'crypto'

function verifySlackSignature(req: NextRequest, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) return true

  const timestamp = req.headers.get('x-slack-request-timestamp')
  const signature = req.headers.get('x-slack-signature')

  if (!timestamp || !signature) return false

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5
  if (parseInt(timestamp) < fiveMinutesAgo) return false

  const sigBasestring = `v0:${timestamp}:${rawBody}`
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex')

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifySlackSignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const params = new URLSearchParams(rawBody)
    const payloadStr = params.get('payload')
    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    const payload = JSON.parse(payloadStr)
    const action = payload.actions?.[0]

    if (!action) {
      return NextResponse.json({ error: 'No action' }, { status: 400 })
    }

    const actionId = action.action_id
    const approvalId = action.value
    const slackUser = payload.user?.name || payload.user?.username || payload.user?.id || 'slack_user'

    if (actionId !== 'approve_request' && actionId !== 'deny_request') {
      return new NextResponse('', { status: 200 })
    }

    const decision = actionId === 'approve_request' ? 'approved' : 'denied'

    const existing = await db.query(
      `SELECT status FROM approval_requests WHERE id = $1`,
      [approvalId]
    )

    if (!existing.rows[0] || existing.rows[0].status !== 'pending') {
      return new NextResponse('', { status: 200 })
    }

    await db.query(
      `UPDATE approval_requests SET status = $1, responded_at = NOW(), responded_by = $2 WHERE id = $3`,
      [decision, `slack:${slackUser}`, approvalId]
    )

    const approvalRow = await db.query(
      `SELECT agent_name, action_description, command, risk_level FROM approval_requests WHERE id = $1`,
      [approvalId]
    )
    const details = approvalRow.rows[0]

    if (details) {
      await updateSlackApprovalMessage(approvalId, decision, slackUser, {
        agentName: details.agent_name,
        actionDescription: details.action_description,
        command: details.command,
        riskLevel: details.risk_level,
      })
    }

    return new NextResponse('', { status: 200 })
  } catch (err) {
    console.error('Slack interactive handler error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
