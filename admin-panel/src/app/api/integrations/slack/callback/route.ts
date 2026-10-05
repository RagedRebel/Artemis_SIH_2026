import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exchangeSlackCode } from '@/lib/slack'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('slack_oauth_state')?.value
  cookieStore.delete('slack_oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/integrations/slack?error=invalid_state', req.url))
  }

  try {
    const data = await exchangeSlackCode(code)
    const userId = (session.user as Record<string, unknown>).id as string | undefined

    await db.query(
      `INSERT INTO slack_connections
       (team_id, team_name, bot_token, bot_user_id, channel_id, channel_name, incoming_webhook_url, connected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.team.id,
        data.team.name,
        data.access_token,
        data.bot_user_id,
        data.incoming_webhook?.channel_id ?? null,
        data.incoming_webhook?.channel ?? null,
        data.incoming_webhook?.url ?? null,
        userId ?? null,
      ]
    )

    return NextResponse.redirect(new URL('/integrations/slack?success=true', req.url))
  } catch (err) {
    console.error('Slack OAuth callback error:', err)
    return NextResponse.redirect(new URL('/integrations/slack?error=auth_failed', req.url))
  }
}
