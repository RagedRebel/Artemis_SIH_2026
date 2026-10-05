'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle2, Loader2, Save } from 'lucide-react'
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

interface ProfileFormProps {
  initialName: string
  initialUsername: string
  initialEmail: string
  initialRole: string
  initialImage: string | null
}

export function ProfileForm({
  initialName,
  initialUsername,
  initialEmail,
  initialRole,
  initialImage,
}: ProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName === '—' ? '' : initialName)
  const [imagePreview, setImagePreview] = useState<string | null>(initialImage)
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(initialImage || undefined)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const initials = (name || initialName || 'U')
    .trim()
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function onPickImage(f: File | null) {
    setError('')
    setSuccess('')
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
    setSuccess('')
    setLoading(true)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          image: imageDataUrl || null,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        setError(errorText || 'Failed to update profile')
        setLoading(false)
        return
      }

      setSuccess('Profile updated successfully.')
      router.refresh()
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader className="rounded-t-2xl border-b border-zinc-100 bg-zinc-50/80 pb-5">
        <CardTitle className="text-lg text-zinc-900">Edit Profile</CardTitle>
        <CardDescription className="text-sm text-zinc-500">
          Update your public profile and avatar.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Avatar</span>
            <div className="flex items-center gap-4">
              <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 transition-colors hover:border-zinc-400 hover:bg-white group">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="absolute inset-0 z-10 cursor-pointer opacity-0"
                  onChange={e => onPickImage(e.target.files?.[0] ?? null)}
                />
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-zinc-900 text-lg font-semibold text-white">
                    {initials}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white">Edit</span>
                </div>
              </label>
              <div className="text-xs text-zinc-500">
                <p>Max file size: 500KB</p>
                <p>Format: JPEG, PNG, WebP</p>
              </div>
            </div>
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
              placeholder="Your Name"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
            <div>
              <p className={labelClass}>Username</p>
              <p className="mt-1 text-sm font-medium text-zinc-700">{initialUsername}</p>
            </div>
            <div>
              <p className={labelClass}>Email</p>
              <p className="mt-1 text-sm font-medium text-zinc-700">{initialEmail}</p>
            </div>
             <div>
              <p className={labelClass}>Role</p>
              <p className="mt-1 text-sm font-medium capitalize text-zinc-700">{initialRole}</p>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-xl border border-lime-200 bg-lime-50 px-3.5 py-2.5 text-sm text-lime-900" role="alert">
              {success}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
