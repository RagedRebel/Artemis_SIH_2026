import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { needsSetup } from '@/lib/setup'
import { SetupForm } from './setup-form'

export default async function SetupPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  try {
    if (!(await needsSetup())) redirect('/login')
  } catch {
    // Mongo unavailable — still show setup with error surfaced from API on submit
  }

  return <SetupForm />
}
