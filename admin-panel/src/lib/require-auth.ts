import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function requireAuthSession() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session
}
