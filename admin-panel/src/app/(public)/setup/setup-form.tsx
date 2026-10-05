'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Hexagon, UserCircle2 } from 'lucide-react'
import { PublicAuthFrame } from '@/components/public-auth-frame'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10'

const labelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })
}

export function SetupForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const initials = (name || 'A')
    .trim()
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function onPickImage(f: File | null) {
    setError('')
    setImageDataUrl(null)
    setImagePreview(null)
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) {
      setError('Use a PNG, JPEG, or WebP image')
      return
    }
    if (f.size > 500_000) {
      setError('Image should be under 500KB')
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(f)
      setImageDataUrl(dataUrl)
      setImagePreview(dataUrl)
    } catch {
      setError('Could not read image')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/setup/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          name: name.trim(),
          image: imageDataUrl ?? undefined,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        setLoading(false)
        return
      }

      const u = username.trim().toLowerCase()
      const sign = await signIn('credentials', {
        username: u,
        password,
        redirect: false,
      })
      if (sign?.error) {
        setError('Account created but sign-in failed — try logging in manually.')
        setLoading(false)
        router.push('/login')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  return (
    <PublicAuthFrame
      hero={
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center gap-2.5 sm:justify-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Logo" className="h-7 w-auto" />
            <div className="inline-flex items-baseline gap-0.5">
              <span className="text-xl font-bold tracking-tight text-white">artemis</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">ai</span>
            </div>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">First-time setup</h1>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-white/75 sm:mx-0">
            Create the administrator account for this installation. You can add a profile photo now or later in
            settings.
          </p>
        </div>
      }
    >
      <Card>
        <CardHeader className="rounded-t-2xl border-b border-zinc-100 bg-zinc-50/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-100 text-lime-900">
              <Hexagon className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg text-zinc-900">Administrator account</CardTitle>
              <CardDescription className="text-sm text-zinc-500">
                Login, display name, and optional avatar.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-2">
              <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 transition-colors hover:border-lime-400/80 hover:bg-white">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={e => onPickImage(e.target.files?.[0] ?? null)}
                />
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-zinc-900 text-2xl font-semibold text-white">
                    {initials}
                  </span>
                )}
              </label>
              <span className="text-xs text-zinc-500">Profile picture (optional)</span>
            </div>

            <div>
              <label htmlFor="name" className={labelClass}>
                Display name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={cn(fieldBase, 'mt-2')}
                placeholder="Alex Operator"
                required
              />
            </div>

            <div>
              <label htmlFor="su-user" className={labelClass}>
                Username
              </label>
              <input
                id="su-user"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={cn(fieldBase, 'mt-2')}
                placeholder="alex"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="su-email" className={labelClass}>
                Email (Optional)
              </label>
              <input
                id="su-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={cn(fieldBase, 'mt-2')}
                placeholder="alex@artemis.local"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="su-pass" className={labelClass}>
                Password (min 8 characters)
              </label>
              <input
                id="su-pass"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={cn(fieldBase, 'mt-2')}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="lime" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create account & enter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PublicAuthFrame>
  )
}
