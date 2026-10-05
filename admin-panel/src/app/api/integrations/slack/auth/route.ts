import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSlackAuthUrl } from '@/lib/slack'
import { v4 as uuid } from 'uuid'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = uuid()
  const cookieStore = await cookies()
  cookieStore.set('slack_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  })

  const url = getSlackAuthUrl(state)
  return NextResponse.redirect(url)
}
