import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppPageHeader } from '@/components/app-page-header'
import { ProfileForm } from './profile-form'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Fetch fresh user data from DB to ensure we have the username and (potentially missing) email
  let dbUser = null
  try {
    const res = await db.query('SELECT * FROM users WHERE id = $1', [session.user.id])
    dbUser = res.rows[0]
  } catch (err) {
    console.error(err)
  }

  const role = dbUser?.role ?? session.user.role ?? 'readonly'
  const name = dbUser?.name ?? session.user.name ?? '—'
  const username = dbUser?.username ?? (session.user as any).username ?? '—'
  const email = dbUser?.email ?? session.user.email ?? '—'
  const image = dbUser?.image_url ?? session.user.image ?? null

  return (
    <div className="space-y-8 pb-12">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Dashboard
      </Link>

      <AppPageHeader
        eyebrow="Account"
        title="Profile"
        description="Your session for this Athenix deployment. Update your current session identity."
      />

      <div className="mx-auto max-w-xl">
        <ProfileForm 
          initialName={name}
          initialUsername={username}
          initialEmail={email}
          initialRole={role}
          initialImage={image}
        />
      </div>
    </div>
  )
}
