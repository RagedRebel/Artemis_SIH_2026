'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Shield } from 'lucide-react'
import { PublicAuthFrame } from '@/components/public-auth-frame'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10'

const labelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const result = await signIn('credentials', {
      username: username.trim(),
      password,
      redirect: false,
    })
    if (result?.error) {
      setError('Invalid username or password')
    } else {
      router.push(callbackUrl.startsWith('/') ? callbackUrl : '/dashboard')
      router.refresh()
    }
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
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Sign in</h1>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-white/75 sm:mx-0">
            Security operations console — use your administrator credentials.
          </p>
        </div>
      }
    >
      <Card>
        <CardHeader className="rounded-t-2xl border-b border-zinc-100 bg-zinc-50/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-100 text-lime-900">
              <Shield className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg text-zinc-900">Credentials</CardTitle>
              <CardDescription className="text-sm text-zinc-500">Username and password required.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className={labelClass}>
                Username
              </label>
              <input
                id="username"
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
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={cn(fieldBase, 'mt-2')}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="lime" size="lg" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </PublicAuthFrame>
  )
}
