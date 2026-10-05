'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Crosshair, Info, ListChecks, Radar, ScanLine, Zap, Flame, ShieldOff, CheckCircle2, Eye, EyeOff, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50'

const fieldClass = cn(fieldBase, 'mt-2')

const labelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500'

type CredType = 'ssh' | 'winrm' | 'http_basic' | 'ad_domain' | 'api_token' | 'database'

interface CredentialMeta {
  domain: string
  port: string
}

interface CredentialRow {
  localId: string
  targetHost: string
  credType: CredType
  username: string
  secret: string
  metadata: CredentialMeta
}

const CRED_TYPES: Array<{ value: CredType; label: string }> = [
  { value: 'ssh', label: 'SSH' },
  { value: 'winrm', label: 'WinRM' },
  { value: 'http_basic', label: 'HTTP basic' },
  { value: 'ad_domain', label: 'Active Directory' },
  { value: 'api_token', label: 'API token' },
  { value: 'database', label: 'Database' },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [maxRisk, setMaxRisk] = useState('high')
  const [cveTesting, setCveTesting] = useState(true)
  const [testingMode, setTestingMode] = useState<'black_box' | 'white_box'>('black_box')
  const [credentials, setCredentials] = useState<CredentialRow[]>([])
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addCredential = () => {
    setCredentials(prev => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        targetHost: '',
        credType: 'ssh',
        username: '',
        secret: '',
        metadata: { domain: '', port: '' },
      },
    ])
  }

  const updateCredential = (localId: string, patch: Partial<CredentialRow>) => {
    setCredentials(prev => prev.map(c => (c.localId === localId ? { ...c, ...patch } : c)))
  }

  const updateCredentialMeta = (localId: string, patch: Partial<CredentialMeta>) => {
    setCredentials(prev =>
      prev.map(c => (c.localId === localId ? { ...c, metadata: { ...c.metadata, ...patch } } : c)),
    )
  }

  const removeCredential = (localId: string) => {
    setCredentials(prev => prev.filter(c => c.localId !== localId))
  }

  const toggleReveal = (localId: string) => {
    setRevealed(prev => ({ ...prev, [localId]: !prev[localId] }))
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim() || !scope.trim()) return

    if (testingMode === 'white_box') {
      for (const c of credentials) {
        if (!c.targetHost.trim() || !c.username.trim() || !c.secret) {
          setError('Every credential row needs a target host, username, and secret.')
          return
        }
      }
    }

    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          targetScope: scope
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          maxRiskLevel: maxRisk,
          enableCveTesting: cveTesting,
          testingMode,
          credentials:
            testingMode === 'white_box'
              ? credentials.map(c => ({
                  targetHost: c.targetHost.trim(),
                  credType: c.credType,
                  username: c.username.trim(),
                  secret: c.secret,
                  metadata: {
                    domain: c.metadata.domain.trim() || undefined,
                    port: c.metadata.port.trim() ? parseInt(c.metadata.port, 10) : undefined,
                  },
                }))
              : [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not create campaign.')
        setSubmitting(false)
        return
      }
      if (typeof data.id === 'string' && data.id.length > 0) {
        router.push(`/campaigns/${data.id}`)
        return
      }
      if (data.queued === true || res.status === 202) {
        router.push('/campaigns?queued=1')
        return
      }
      setError('Unexpected response from server.')
      setSubmitting(false)
    } catch {
      setError('Network error. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        All campaigns
      </Link>

      <div className="border-b border-zinc-200/80 pb-8">
        <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-800">
          <span
            className="size-2 shrink-0 rounded-full bg-lime-500 shadow-[0_0_0_3px_rgba(163,230,53,0.45)]"
            aria-hidden
          />
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">New campaign</h1>
        <p className="mt-2 max-w-2xl text-base text-zinc-500">
          Define scope and risk posture. Your request is queued for the campaign handler; it creates the campaign in the
          database when processing starts, then runs CVE intelligence, red-team testing, and blue-team correlation.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:items-start xl:gap-10">
        <Card>
          <CardHeader className="rounded-t-2xl border-b border-zinc-100 bg-zinc-50/80 pb-5">
            <CardTitle className="text-lg text-zinc-900">Launch parameters</CardTitle>
            <CardDescription className="text-sm text-zinc-500">
              Required fields are validated before the job is pushed to the campaign queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="campaign-name" className={labelClass}>
                  Campaign name
                </label>
                <input
                  id="campaign-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={fieldClass}
                  placeholder="e.g. Q1 2026 external assessment"
                  required
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="campaign-scope" className={labelClass}>
                  Target scope
                </label>
                <p className="mt-1 text-xs text-zinc-500">Comma-separated IPv4 addresses or CIDR ranges in scope.</p>
                <textarea
                  id="campaign-scope"
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                  className={cn(fieldBase, 'mt-2 min-h-[88px] resize-y font-mono text-[13px] leading-relaxed')}
                  placeholder="172.30.0.0/24, 10.0.1.50, 192.168.1.0/24"
                  required
                  rows={3}
                />
              </div>

              <div>
                <p className={labelClass}>Testing mode</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {([
                    { value: 'black_box', label: 'Black-box', desc: 'No credentials — external perspective only.', Icon: EyeOff },
                    { value: 'white_box', label: 'White-box', desc: 'Provide creds for authenticated tests.',     Icon: KeyRound },
                  ] as const).map(({ value, label, desc, Icon }) => {
                    const selected = testingMode === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTestingMode(value)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                          selected
                            ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60',
                        )}
                      >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-white/10' : 'bg-zinc-100')}>
                          <Icon className={cn('h-4 w-4', selected ? 'text-white' : 'text-zinc-700')} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm font-semibold', selected ? 'text-white' : 'text-zinc-900')}>{label}</span>
                          <span className={cn('block text-xs leading-relaxed', selected ? 'text-zinc-300' : 'text-zinc-500')}>{desc}</span>
                        </span>
                        {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-white" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {testingMode === 'white_box' && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">Target credentials</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        Secrets are AES-256-GCM encrypted with the server master key before persistence. Only decrypted in-memory during red-team execution.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={addCredential} className="shrink-0">
                      <Plus className="h-4 w-4" aria-hidden />
                      Add
                    </Button>
                  </div>

                  {credentials.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-4 text-center text-xs text-zinc-500">
                      No credentials yet. Add at least one to enable authenticated testing paths.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {credentials.map((c, idx) => (
                        <div key={c.localId} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Credential #{idx + 1}</p>
                            <button
                              type="button"
                              onClick={() => removeCredential(c.localId)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Remove
                            </button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className={labelClass}>Target host</label>
                              <input
                                type="text"
                                value={c.targetHost}
                                onChange={e => updateCredential(c.localId, { targetHost: e.target.value })}
                                className={fieldClass}
                                placeholder="10.0.1.50 or dc01.corp.local"
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Credential type</label>
                              <select
                                value={c.credType}
                                onChange={e => updateCredential(c.localId, { credType: e.target.value as CredType })}
                                className={fieldClass}
                              >
                                {CRED_TYPES.map(t => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Username</label>
                              <input
                                type="text"
                                value={c.username}
                                onChange={e => updateCredential(c.localId, { username: e.target.value })}
                                className={fieldClass}
                                autoComplete="off"
                                placeholder="administrator"
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Secret</label>
                              <div className="relative">
                                <input
                                  type={revealed[c.localId] ? 'text' : 'password'}
                                  value={c.secret}
                                  onChange={e => updateCredential(c.localId, { secret: e.target.value })}
                                  className={cn(fieldClass, 'pr-10')}
                                  autoComplete="new-password"
                                  placeholder="••••••••"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(c.localId)}
                                  className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                                  aria-label={revealed[c.localId] ? 'Hide secret' : 'Reveal secret'}
                                >
                                  {revealed[c.localId] ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                                </button>
                              </div>
                            </div>
                            {(c.credType === 'ad_domain' || c.credType === 'winrm') && (
                              <div>
                                <label className={labelClass}>Domain</label>
                                <input
                                  type="text"
                                  value={c.metadata.domain}
                                  onChange={e => updateCredentialMeta(c.localId, { domain: e.target.value })}
                                  className={fieldClass}
                                  placeholder="corp.local"
                                />
                              </div>
                            )}
                            {(c.credType === 'ssh' || c.credType === 'winrm' || c.credType === 'database' || c.credType === 'http_basic') && (
                              <div>
                                <label className={labelClass}>Port (optional)</label>
                                <input
                                  type="number"
                                  value={c.metadata.port}
                                  onChange={e => updateCredentialMeta(c.localId, { port: e.target.value })}
                                  className={fieldClass}
                                  placeholder="22"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className={labelClass}>Max risk level</p>
                <div className="mt-2 flex flex-col gap-2">
                  {([
                    { value: 'low',      label: 'Low',      desc: 'Scan only, no exploitation',            Icon: ScanLine,  iconBg: 'bg-lime-100',   iconColor: 'text-lime-700',   activeBorder: 'border-lime-500',   activeBg: 'bg-lime-50',   activeIcon: 'bg-lime-500 text-white',  activeLabel: 'text-lime-900',  activeDesc: 'text-lime-700'  },
                    { value: 'medium',   label: 'Medium',   desc: 'Non-destructive exploitation',          Icon: Zap,       iconBg: 'bg-amber-100',  iconColor: 'text-amber-700',  activeBorder: 'border-amber-400',  activeBg: 'bg-amber-50',  activeIcon: 'bg-amber-400 text-white', activeLabel: 'text-amber-900', activeDesc: 'text-amber-700' },
                    { value: 'high',     label: 'High',     desc: 'Full exploitation with approval gates', Icon: Flame,     iconBg: 'bg-orange-100', iconColor: 'text-orange-700', activeBorder: 'border-orange-500', activeBg: 'bg-orange-50', activeIcon: 'bg-orange-500 text-white', activeLabel: 'text-orange-900', activeDesc: 'text-orange-700' },
                    { value: 'critical', label: 'Critical', desc: 'Sensitive actions require approval',    Icon: ShieldOff, iconBg: 'bg-red-100',    iconColor: 'text-red-700',    activeBorder: 'border-red-500',    activeBg: 'bg-red-50',    activeIcon: 'bg-red-600 text-white',   activeLabel: 'text-red-900',   activeDesc: 'text-red-600'   },
                  ] as const).map(({ value, label, desc, Icon, iconBg, iconColor, activeBorder, activeBg, activeIcon, activeLabel, activeDesc }) => {
                    const selected = maxRisk === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMaxRisk(value)}
                        className={cn(
                          'flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all',
                          selected
                            ? cn('shadow-sm', activeBorder, activeBg)
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60',
                        )}
                      >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors', selected ? activeIcon : iconBg)}>
                          <Icon className={cn('h-4 w-4', selected ? 'text-white' : iconColor)} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm font-semibold', selected ? activeLabel : 'text-zinc-900')}>{label}</span>
                          <span className={cn('block text-xs leading-relaxed', selected ? activeDesc : 'text-zinc-500')}>{desc}</span>
                        </span>
                        {selected && <CheckCircle2 className={cn('h-4 w-4 shrink-0', activeLabel)} aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-4">
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    id="cve-testing"
                    checked={cveTesting}
                    onChange={e => setCveTesting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-lime-600 focus:ring-2 focus:ring-zinc-900/15"
                  />
                  <div>
                    <label htmlFor="cve-testing" className="text-sm font-medium text-zinc-900">
                      CVE intelligence testing
                    </label>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Queue recent CVE context and applicability checks before and during the assessment.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-6 sm:flex-row sm:justify-end">
                <Button variant="secondary" type="button" asChild className="w-full sm:w-auto">
                  <Link href="/campaigns">Cancel</Link>
                </Button>
                <Button type="submit" variant="lime" disabled={submitting} className="w-full sm:w-auto">
                  {submitting ? 'Launching…' : 'Launch campaign'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader className="rounded-t-2xl pb-3">
              <div className="flex items-center gap-2 text-zinc-900">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-100">
                  <Info className="h-4 w-4 text-lime-900" aria-hidden />
                </div>
                <CardTitle className="text-base font-semibold">Before you launch</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-sm text-zinc-600">
              <p className="flex gap-2.5 leading-relaxed">
                <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                <span>Only list systems you are authorized to test. The orchestrator enforces scope for sub-agents.</span>
              </p>
              <p className="flex gap-2.5 leading-relaxed">
                <Radar className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                <span>Higher risk levels may trigger human approval for destructive or critical actions.</span>
              </p>
              <p className="flex gap-2.5 leading-relaxed">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                <span>After launch, open the campaign to track findings, live activity, and agent reports.</span>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
