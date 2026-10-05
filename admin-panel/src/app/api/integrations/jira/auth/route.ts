import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getJiraAuthUrl } from '@/lib/jira'
import { v4 as uuid } from 'uuid'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = uuid()
  const cookieStore = await cookies()
  cookieStore.set('jira_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  })

  const url = getJiraAuthUrl(state)
  return NextResponse.redirect(url)
}
