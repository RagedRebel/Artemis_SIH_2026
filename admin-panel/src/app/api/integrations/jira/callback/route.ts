import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exchangeJiraCode, getAccessibleResources } from '@/lib/jira'
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
  const savedState = cookieStore.get('jira_oauth_state')?.value
  cookieStore.delete('jira_oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/integrations/jira?error=invalid_state', req.url))
  }

  try {
    const tokens = await exchangeJiraCode(code)
    const resources = await getAccessibleResources(tokens.access_token)

    if (resources.length === 0) {
      return NextResponse.redirect(new URL('/integrations/jira?error=no_sites', req.url))
    }

    const userId = (session.user as Record<string, unknown>).id as string | undefined

    for (const site of resources) {
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      await db.query(
        `INSERT INTO jira_connections (site_url, cloud_id, access_token, refresh_token, token_expires_at, scopes, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [site.url, site.id, tokens.access_token, tokens.refresh_token, expiresAt, tokens.scope, userId ?? null]
      )
    }

    return NextResponse.redirect(new URL('/integrations/jira?success=true', req.url))
  } catch (err) {
    console.error('Jira OAuth callback error:', err)
    return NextResponse.redirect(new URL('/integrations/jira?error=auth_failed', req.url))
  }
}
