import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { needsSetup } from '@/lib/setup'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  let mustSetup = false
  try {
    mustSetup = await needsSetup()
  } catch {
    mustSetup = true
  }
  if (mustSetup) redirect('/setup')

  return (
    <Suspense fallback={<div className="h-44 w-full animate-pulse rounded-xl bg-zinc-200/90" />}>
      <LoginForm />
    </Suspense>
  )
}
