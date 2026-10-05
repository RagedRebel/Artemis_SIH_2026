'use client'

import type { ReactNode } from 'react'
import {
  AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Shield,
  Lock, LockOpen, Key, ChevronRight, Server, Globe, Code2, Layers,
  TrendingUp, ScanLine, Lightbulb, ArrowRight, Users, Hash,
  FileSearch, Crosshair,
} from 'lucide-react'
import { AgentMarkdown } from '@/components/agent-markdown'
import { SeverityBadge } from '@/components/severity-badge'
import { cn } from '@/lib/utils'

export type AuditOutputPresentation = 'full' | 'campaign'

function parseOutput(output: unknown): Record<string, unknown> | null {
  if (output === null || output === undefined) return null
  if (typeof output === 'string') {
    try {
      return JSON.parse(output) as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (typeof output === 'object') return output as Record<string, unknown>
  return null
}

type HostSummary = {
  ip?: string
  hostname?: string
  os?: string
  openPortCount?: number
  /** Backend sends `openPorts`; older payloads may use `ports` */
  openPorts?: Array<{ port: number; protocol: string; service: string; version?: string | null; state?: string }>
  ports?: Array<{ port: number; protocol: string; service: string; version?: string | null }>
  portsTruncated?: boolean
}

// REMOVED OVERVIEW_TOOLS

function JsonDetails({ data }: { data: Record<string, unknown> }) {
  return (
    <details className="group text-[11px] text-zinc-500">
      <summary className="cursor-pointer select-none font-medium text-zinc-600 hover:text-zinc-900">
        Raw JSON
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 leading-relaxed text-zinc-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

function NmapSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const text =
    typeof o.textOverview === 'string'
      ? o.textOverview
      : typeof o.scanOverview === 'string'
        ? o.scanOverview
        : null
  const rawSummaries = (Array.isArray(o.hostSummaries) ? o.hostSummaries : []) as HostSummary[]
  // Normalise: backend sends `openPorts`, older payloads may use `ports`
  const summaries = rawSummaries.map(h => {
    const resolvedPorts = h.openPorts ?? h.ports ?? []
    return { ...h, ports: resolvedPorts, openPortCount: h.openPortCount ?? resolvedPorts.length }
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">Nmap overview</p>
        {text ? (
          campaignUI ? (
            <div
              className={cn(
                'mt-2 max-h-64 overflow-auto rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4',
                'text-sm leading-relaxed text-zinc-800'
              )}
            >
              {/\*\*|[*]\s/.test(text) ? <AgentMarkdown source={text} /> : <p className="whitespace-pre-wrap">{text}</p>}
            </div>
          ) : (
            <pre
              className={cn(
                'mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3',
                'text-[11px] leading-relaxed text-zinc-800'
              )}
            >
              {text}
            </pre>
          )
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No text overview in this audit row (older run or parse issue).</p>
        )}
      </div>

      {summaries.length > 0 && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Open ports by host</p>
          {summaries.map((h, i) => (
            <div
              key={`${h.ip ?? i}-${i}`}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
            >
              <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-mono text-sm font-semibold text-zinc-900">{h.ip ?? '—'}</p>
                {h.hostname && <p className="text-xs text-zinc-500">{h.hostname}</p>}
                {h.os && <p className="mt-0.5 text-[11px] text-zinc-600">OS: {h.os}</p>}
                <p className="mt-1 text-[11px] font-medium text-zinc-600">
                  {(h.openPortCount ?? h.ports?.length ?? 0) === 0
                    ? 'No open ports in this result'
                    : `${h.openPortCount ?? h.ports?.length} open port(s)`}
                </p>
              </div>
              {h.ports && h.ports.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        <th className="px-3 py-2">Port</th>
                        <th className="px-3 py-2">Proto</th>
                        <th className="px-3 py-2">Service</th>
                        <th className="px-3 py-2">Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.ports.map((p, j) => (
                        <tr key={j} className="border-b border-zinc-50 last:border-0">
                          <td className="px-3 py-1.5 font-mono font-medium text-zinc-900">{p.port}</td>
                          <td className="px-3 py-1.5 font-mono text-zinc-600">{p.protocol}</td>
                          <td className="px-3 py-1.5 text-zinc-800">{p.service || '—'}</td>
                          <td className="max-w-[200px] truncate px-3 py-1.5 text-zinc-600" title={p.version ?? ''}>
                            {p.version || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {h.portsTruncated && (
                <p className="border-t border-zinc-100 px-3 py-2 text-[10px] text-amber-800">
                  Port list truncated in audit payload — see Nmap overview or raw JSON for full data.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

function ReportFindingSection({
  input,
  output,
  campaignUI,
}: {
  input: Record<string, unknown>
  output: Record<string, unknown>
  campaignUI: boolean
}) {
  const title = typeof input.title === 'string' ? input.title : 'Finding'
  const severity = typeof input.severity === 'string' ? input.severity : 'info'
  const cvss = typeof input.cvssScore === 'number' ? input.cvssScore : Number(input.cvssScore)
  const host = typeof input.affectedHost === 'string' ? input.affectedHost : '—'
  const description = typeof input.description === 'string' ? input.description : null
  const findingId =
    typeof output.findingId === 'string'
      ? output.findingId
      : typeof output.id === 'string'
        ? output.id
        : null

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Reported finding</p>
            <p className="mt-1 text-base font-semibold leading-snug text-zinc-900">{title}</p>
            <p className={cn('mt-2 text-sm text-zinc-600', campaignUI ? '' : 'font-mono text-xs')}>
              Host <span className="font-semibold text-zinc-800">{host}</span>
            </p>
            {campaignUI && description && (
              <p className="mt-3 border-t border-zinc-200/80 pt-3 text-sm leading-relaxed text-zinc-700">{description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={severity} />
            {!Number.isNaN(cvss) && (
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-zinc-700">
                CVSS {cvss.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        {findingId && !campaignUI && (
          <p className="mt-3 border-t border-zinc-200 pt-3 font-mono text-[10px] text-zinc-500">
            Finding ID: <span className="text-zinc-800">{findingId}</span>
          </p>
        )}
      </div>
      {!campaignUI && <JsonDetails data={{ ...input, ...output }} />}
    </div>
  )
}

function CloseCampaignSection({
  input,
  output,
  campaignUI,
}: {
  input: Record<string, unknown>
  output: Record<string, unknown>
  campaignUI: boolean
}) {
  const summary = typeof input.summary === 'string' ? input.summary : null
  const count = output.findingsCount

  return (
    <div className="space-y-4">
      {summary && (
        <div className="rounded-xl border border-zinc-200/90 bg-linear-to-b from-white to-zinc-50/80 p-5 shadow-sm">
          {campaignUI ? (
            <AgentMarkdown source={summary} />
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">
              {summary}
            </pre>
          )}
        </div>
      )}
      {count != null && (
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-900">{String(count)}</span> findings in this campaign at close-out.
        </p>
      )}
      {!campaignUI && <JsonDetails data={{ ...input, ...output }} />}
    </div>
  )
}

function CreateCampaignSection({ input, campaignUI }: { input: Record<string, unknown>; campaignUI: boolean }) {
  const scopeFont = campaignUI ? 'text-[13px] font-medium text-zinc-800' : 'font-mono text-[11px] text-zinc-800'
  const name = typeof input.name === 'string' ? input.name : '—'
  const scope = Array.isArray(input.targetScope) ? (input.targetScope as string[]) : []
  const risk = typeof input.maxRiskLevel === 'string' ? input.maxRiskLevel : '—'
  const by = typeof input.createdBy === 'string' ? input.createdBy : null

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <dt className="font-medium text-zinc-500">Name</dt>
          <dd className="font-semibold text-zinc-900">{name}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Max risk</dt>
          <dd className="mt-0.5 capitalize text-zinc-900">{risk}</dd>
        </div>
        {by && (
          <div>
            <dt className="font-medium text-zinc-500">Created by</dt>
            <dd className={cn('mt-0.5 text-xs text-zinc-800', campaignUI ? '' : 'font-mono')}>{by}</dd>
          </div>
        )}
        <div>
          <dt className="mb-1 font-medium text-zinc-500">Target scope</dt>
          <dd className="flex flex-wrap gap-1.5">
            {scope.length === 0 ? (
              <span className="text-zinc-400">—</span>
            ) : (
              scope.map(s => (
                <span
                  key={s}
                  className={cn(
                    'rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5',
                    scopeFont
                  )}
                >
                  {s}
                </span>
              ))
            )}
          </dd>
        </div>
      </dl>
      {!campaignUI && <JsonDetails data={input} />}
    </div>
  )
}

function UpdateCampaignSection({ input, campaignUI }: { input: Record<string, unknown>; campaignUI: boolean }) {
  const status = typeof input.status === 'string' ? input.status : '—'
  const cid = typeof input.campaignId === 'string' ? input.campaignId : null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold capitalize text-zinc-800">
          {status}
        </span>
        {cid && !campaignUI && (
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-mono text-[10px] text-zinc-600">
            {cid.slice(0, 8)}…
          </span>
        )}
      </div>
      {!campaignUI && <JsonDetails data={input} />}
    </div>
  )
}

function ResultBlock({ title, text, campaignUI }: { title: string; text: string; campaignUI: boolean }) {
  return (
    <div>
      {!campaignUI && title && (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      )}
      {campaignUI ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 text-sm leading-relaxed text-zinc-800">
          {/\*\*|\n\s*[\*\-]\s/.test(text) ? <AgentMarkdown source={text} /> : <p className="whitespace-pre-wrap">{text}</p>}
        </div>
      ) : (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-800">
          {text}
        </pre>
      )}
    </div>
  )
}

function GenericScannerSection({
  toolName,
  o,
  campaignUI,
}: {
  toolName: string
  o: Record<string, unknown>
  campaignUI: boolean
}) {
  const summary = typeof o.summary === 'string' ? o.summary : typeof o.textOverview === 'string' ? o.textOverview : null
  const findings = Array.isArray(o.keyFindings) ? (o.keyFindings as string[]) : []
  const discoveries = Array.isArray(o.discoveries) ? (o.discoveries as string[]) : []
  const injectable = typeof o.injectable === 'boolean' ? o.injectable : null
  const rawOutput = typeof o.rawOutput === 'string' ? o.rawOutput : typeof o.response === 'string' ? o.response : null

  return (
    <div className="space-y-4">
      {summary && (
        <div>
          {!campaignUI && <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 mb-2">Scan Summary</p>}
          <div
            className={cn(
              'max-h-64 overflow-auto rounded-xl border p-4 text-sm leading-relaxed text-zinc-800',
              campaignUI ? 'border-zinc-200/80 bg-zinc-50/50' : 'border-sky-200 bg-sky-50'
            )}
          >
            {/\*\*|\n\s*[\*\-]\s/.test(summary) ? <AgentMarkdown source={summary} /> : <p className="whitespace-pre-wrap">{summary}</p>}
          </div>
        </div>
      )}

      {injectable !== null && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Injectable Parameter Found:</span>
          {injectable ? (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 border border-red-200">YES</span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 border border-zinc-200">NO</span>
          )}
        </div>
      )}

      {findings.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-800 mb-3">Key Findings / Vulnerabilities</p>
          <ul className="list-disc pl-5 text-xs text-rose-900 space-y-1.5 marker:text-rose-400">
            {findings.map((f, i) => (
              <li key={i} className="leading-relaxed">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {discoveries.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800 mb-3">Directories / File Discoveries</p>
          <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1.5 marker:text-amber-400">
            {discoveries.slice(0, 20).map((d, i) => (
              <li key={i} className="leading-relaxed font-mono">{d}</li>
            ))}
            {discoveries.length > 20 && (
              <li className="list-none pt-2 text-amber-700 italic">...and {discoveries.length - 20} more discoveries</li>
            )}
          </ul>
        </div>
      )}

      {!campaignUI && rawOutput && !summary && (
        <ResultBlock title="Raw Output" text={rawOutput} campaignUI={false} />
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

function ConsoleOutputBlock({ output, maxHeight = 'max-h-96' }: { output: string; maxHeight?: string }) {
  return (
    <pre
      className={cn(
        'overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-700/60 bg-zinc-900 p-4',
        'font-mono text-[11px] leading-relaxed text-green-300 shadow-inner',
        maxHeight
      )}
    >
      {output}
    </pre>
  )
}

function MsfExploitSection({
  o,
  inp,
  campaignUI,
}: {
  o: Record<string, unknown>
  inp: Record<string, unknown>
  campaignUI: boolean
}) {
  const sessionOpened = o.sessionOpened === true
  const activeSessionIds = Array.isArray(o.activeSessionIds) ? (o.activeSessionIds as string[]) : []
  const proof = typeof o.proof === 'string' && o.proof.length > 0 ? o.proof : null
  const output = typeof o.output === 'string' ? o.output : null
  const module = typeof inp.module === 'string' ? inp.module : null
  const target = typeof inp.target === 'string' ? inp.target : null
  const port = inp.port != null ? String(inp.port) : null
  const payload = typeof inp.payload === 'string' ? inp.payload : null

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3',
          sessionOpened
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700'
        )}
      >
        {sessionOpened ? <LockOpen className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
        <div>
          <p className="text-sm font-semibold">
            {sessionOpened ? 'Session Opened — Exploitation Successful' : 'No Session Opened'}
          </p>
          {activeSessionIds.length > 0 && (
            <p className="mt-0.5 text-xs opacity-80">
              Active session IDs: {activeSessionIds.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Module / target info */}
      {(module || target) && (
        <div className="flex flex-wrap gap-2">
          {module && (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-mono text-[11px] text-violet-800">
              {module}
            </span>
          )}
          {target && (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 font-mono text-[11px] text-zinc-700">
              {target}{port ? `:${port}` : ''}
            </span>
          )}
          {payload && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] text-amber-800">
              {payload}
            </span>
          )}
        </div>
      )}

      {/* Proof of compromise */}
      {proof && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700 mb-2">Proof of Compromise</p>
          <ConsoleOutputBlock output={proof} maxHeight="max-h-48" />
        </div>
      )}

      {/* Full MSF console output */}
      {output && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">Console Output</p>
          <ConsoleOutputBlock output={output} />
        </div>
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

function MsfCommandSection({
  o,
  inp,
  campaignUI,
}: {
  o: Record<string, unknown>
  inp: Record<string, unknown>
  campaignUI: boolean
}) {
  const output = typeof o.output === 'string' ? o.output : null
  const success = o.success === true
  const error = typeof o.error === 'string' ? o.error : null
  const command = typeof inp.command === 'string' ? inp.command : typeof inp.query === 'string' ? `search ${inp.query}` : null

  return (
    <div className="space-y-3">
      {/* Command + status */}
      <div className="flex flex-wrap items-center gap-2">
        {command && (
          <code className="rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-1 font-mono text-[11px] text-green-300">
            msf6 &gt; {command}
          </code>
        )}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            success
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          )}
        >
          {success ? 'OK' : 'FAILED'}
        </span>
      </div>

      {error && !success && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {output ? <ConsoleOutputBlock output={output} /> : (!success && !error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 opacity-80 italic">
          No output received from msfconsole.
        </div>
      ))}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

function CommandOutputSection({
  o,
  inp,
  campaignUI,
}: {
  o: Record<string, unknown>
  inp: Record<string, unknown>
  campaignUI: boolean
}) {
  const stdout = typeof o.stdout === 'string' ? o.stdout : null
  const stderr = typeof o.stderr === 'string' ? o.stderr : null
  const returncode = typeof o.returncode === 'number' ? o.returncode : null
  const command = typeof inp.command === 'string' ? inp.command : null

  return (
    <div className="space-y-3">
      {/* Command + exit code */}
      <div className="flex flex-wrap items-center gap-2">
        {command && (
          <code className="rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-1 font-mono text-[11px] text-green-300">
            $ {command}
          </code>
        )}
        {returncode !== null && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide',
              returncode === 0
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-red-200 bg-red-50 text-red-800'
            )}
          >
            EXIT {returncode}
          </span>
        )}
      </div>

      {stdout && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">stdout</p>
          <ConsoleOutputBlock output={stdout} />
        </div>
      )}

      {stderr && stderr.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-500 mb-2">stderr</p>
          <pre
            className={cn(
              'max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-red-300/60 bg-red-950 p-4',
              'font-mono text-[11px] leading-relaxed text-red-300'
            )}
          >
            {stderr}
          </pre>
        </div>
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

function SearchsploitSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const count = typeof o.count === 'number' ? o.count : 0
  const output = o.output
  const isArray = Array.isArray(output)

  return (
    <div className="space-y-4">
      {!campaignUI && (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">SearchSploit Results</p>
      )}
      
      {isArray && output.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-violet-50 px-3 py-2">
            <p className="text-[11px] font-medium text-violet-800">
              Found {count} matching exploit(s)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Path</th>
                </tr>
              </thead>
              <tbody>
                {(output as any[]).map((ex, i) => (
                  <tr key={i} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                    <td className="px-3 py-2 font-medium text-zinc-900">{ex.title || '—'}</td>
                    <td className="px-3 py-2 text-zinc-600 capitalize">{ex.type || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 max-w-[200px] truncate" title={ex.path}>
                      {ex.path || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : isArray && output.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 text-xs text-zinc-600">
          No exploits found matching this query.
        </div>
      ) : typeof output === 'string' ? (
        <ConsoleOutputBlock output={output} />
      ) : null}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Tech Detection
// ─────────────────────────────────────────────────────────────────────────────

type TechBadgeProps = { icon: ReactNode; label: string; value: string; color: 'blue' | 'violet' | 'amber' | 'zinc' | 'orange' | 'green' | 'red' }
function TechBadge({ icon, label, value, color }: TechBadgeProps) {
  const colors = {
    blue:   'border-blue-200   bg-blue-50   text-blue-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
    amber:  'border-amber-200  bg-amber-50  text-amber-800',
    zinc:   'border-zinc-200   bg-zinc-50   text-zinc-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    green:  'border-green-200  bg-green-50  text-green-800',
    red:    'border-red-200    bg-red-50    text-red-800',
  }
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', colors[color])}>
      <span className="shrink-0 opacity-70">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</p>
        <p className="text-xs font-semibold truncate">{value}</p>
      </div>
    </div>
  )
}

type DetectedTag = { name: string; values: string[] }

function parseWhatWebTags(raw: string): DetectedTag[] {
  const lines = raw.split('\n').filter(l => l.trim())
  const tags: DetectedTag[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    let afterUrl = line.replace(/^https?:\/\/\S+\s*/, '')
    afterUrl = afterUrl.replace(/^\[\d{3}\s[^\]]*\]\s*/, '')

    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < afterUrl.length; i++) {
      if (afterUrl[i] === '[') depth++
      else if (afterUrl[i] === ']') depth--
      else if (afterUrl[i] === ',' && depth === 0) {
        parts.push(afterUrl.slice(start, i).trim())
        start = i + 1
      }
    }
    const last = afterUrl.slice(start).trim()
    if (last) parts.push(last)

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const bracketIdx = trimmed.indexOf('[')
      if (bracketIdx === -1) {
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase())
          tags.push({ name: trimmed, values: [] })
        }
        continue
      }

      const name = trimmed.slice(0, bracketIdx).trim()
      if (!name) continue

      const values: string[] = []
      const re = /\[([^\]]*)\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(trimmed)) !== null) {
        if (m[1]) values.push(m[1])
      }

      const key = name.toLowerCase()
      if (seen.has(key)) {
        const existing = tags.find(t => t.name.toLowerCase() === key)
        if (existing) {
          for (const v of values) {
            if (!existing.values.includes(v)) existing.values.push(v)
          }
        }
      } else {
        seen.add(key)
        tags.push({ name, values })
      }
    }
  }

  return tags
}

const TAG_COLORS: Record<string, TechBadgeProps['color']> = {
  httpserver: 'zinc',
  ip: 'blue',
  country: 'green',
  title: 'violet',
  html5: 'amber',
  frame: 'amber',
  cookies: 'orange',
  'x-powered-by': 'violet',
  'meta-author': 'zinc',
  email: 'red',
  'open-graph-protocol': 'blue',
  script: 'amber',
  'redirect-location': 'orange',
}

const TAG_ICONS: Record<string, typeof Globe> = {
  httpserver: Server,
  ip: Globe,
  country: Globe,
  title: Layers,
  email: Key,
}

function tagColor(name: string): TechBadgeProps['color'] {
  return TAG_COLORS[name.toLowerCase()] ?? 'zinc'
}

function WebTechSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const stack = o.techStack as Record<string, unknown> | undefined
  const recs = Array.isArray(o.recommendations) ? (o.recommendations as string[]) : []
  const url = typeof o.url === 'string' ? o.url : null
  const wafDetected = !!stack?.waf
  const tlsStr = stack?.tlsVersion ? String(stack.tlsVersion) : ''
  const tlsDeprecated = tlsStr.includes('deprecated') || tlsStr.includes('1.0') || tlsStr.includes('1.1')

  const rawWhatweb = typeof o.rawWhatweb === 'string' ? o.rawWhatweb.trim() : ''
  const stackRaw = typeof stack?.raw === 'string' ? (stack.raw as string).trim() : ''
  const whatwebSource = rawWhatweb || stackRaw

  const detectedTech = Array.isArray(o.detectedTech) && o.detectedTech.length > 0
    ? (o.detectedTech as DetectedTag[])
    : whatwebSource ? parseWhatWebTags(whatwebSource) : []

  const hasBadges = !!(stack?.cms || stack?.framework || stack?.language || stack?.server || stack?.waf || tlsStr)

  const stackHeaders = (stack?.headers && typeof stack.headers === 'object') ? stack.headers as Record<string, string> : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
        <ScanLine className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-900">Technology Fingerprint</p>
          {url && <p className="font-mono text-[10px] text-blue-600 truncate mt-0.5">{url}</p>}
        </div>
        {wafDetected && (
          <span className="ml-auto flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-800 shrink-0">
            <Shield className="h-3 w-3" /> WAF
          </span>
        )}
      </div>

      {/* Known tech stack badges (CMS, framework, etc.) */}
      {stack && hasBadges && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {!!stack.cms      && <TechBadge icon={<Globe   className="h-3.5 w-3.5" />} label="CMS"       value={String(stack.cms)}       color="blue"   />}
          {!!stack.framework && <TechBadge icon={<Layers  className="h-3.5 w-3.5" />} label="Framework" value={String(stack.framework)}  color="violet" />}
          {!!stack.language  && <TechBadge icon={<Code2   className="h-3.5 w-3.5" />} label="Language"  value={String(stack.language).toUpperCase()} color="amber" />}
          {!!stack.server    && <TechBadge icon={<Server  className="h-3.5 w-3.5" />} label="Server"    value={String(stack.server)}     color="zinc"   />}
          {!!stack.waf       && <TechBadge icon={<Shield  className="h-3.5 w-3.5" />} label="WAF"       value={String(stack.waf)}        color="orange" />}
          {!!tlsStr          && <TechBadge icon={tlsDeprecated ? <Lock className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />} label="TLS" value={tlsStr} color={tlsDeprecated ? 'red' : 'green'} />}
        </div>
      )}

      {/* Dynamic WhatWeb tags */}
      {detectedTech.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">Detected Technologies</p>
          <div className="flex flex-wrap gap-2">
            {detectedTech.map((tag, i) => {
              const color = tagColor(tag.name)
              const IconCmp = TAG_ICONS[tag.name.toLowerCase()]
              const display = tag.values.length > 0 ? `${tag.name}: ${tag.values.join(', ')}` : tag.name
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium',
                    color === 'blue'   && 'border-blue-200   bg-blue-50   text-blue-800',
                    color === 'violet' && 'border-violet-200 bg-violet-50 text-violet-800',
                    color === 'amber'  && 'border-amber-200  bg-amber-50  text-amber-800',
                    color === 'zinc'   && 'border-zinc-200   bg-zinc-50   text-zinc-700',
                    color === 'orange' && 'border-orange-200 bg-orange-50 text-orange-800',
                    color === 'green'  && 'border-green-200  bg-green-50  text-green-800',
                    color === 'red'    && 'border-red-200    bg-red-50    text-red-800',
                  )}
                >
                  {IconCmp ? <IconCmp className="h-3 w-3 shrink-0 opacity-60" /> : null}
                  {tag.values.length > 0 ? (
                    <span><span className="font-semibold">{tag.name}</span> <span className="opacity-75">{tag.values.join(', ')}</span></span>
                  ) : (
                    <span className="font-semibold">{tag.name}</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Response headers */}
      {stackHeaders && Object.keys(stackHeaders).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-700">
            Response Headers ({Object.keys(stackHeaders).length})
          </summary>
          <div className="mt-2 rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <tbody>
                  {Object.entries(stackHeaders).slice(0, 20).map(([k, v]) => (
                    <tr key={k} className="border-b border-zinc-50 last:border-0">
                      <td className="px-3 py-1.5 font-mono font-medium text-zinc-600 whitespace-nowrap">{k}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-800 break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {/* WhatWeb raw output — collapsible */}
      {rawWhatweb && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-700">
            WhatWeb raw output
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
            {rawWhatweb}
          </pre>
        </details>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">Recommended Next Steps</p>
          </div>
          <ul className="space-y-2">
            {recs.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Attack Results (LFI, XSS, Auth, CORS, SSRF)
// ─────────────────────────────────────────────────────────────────────────────

type WebAttackFinding = { payload?: string; evidence?: string; type?: string; param?: string; probe?: string; url?: string; severity?: string; test?: string; origin?: string; allowedOrigin?: string; allowCredentials?: boolean }

function WebAttackSection({
  toolName, o, campaignUI,
}: {
  toolName: string
  o: Record<string, unknown>
  campaignUI: boolean
}) {
  const vulnerable = o.vulnerable === true
  const findings = Array.isArray(o.findings) ? (o.findings as WebAttackFinding[]) : []
  const bypasses = Array.isArray(o.bypasses) ? (o.bypasses as WebAttackFinding[]) : findings
  const hint = typeof o.hint === 'string' ? o.hint : null

  const toolLabels: Record<string, { label: string; color: string }> = {
    lfi_test: { label: 'LFI / Path Traversal', color: 'red' },
    xss_scan: { label: 'XSS', color: 'orange' },
    auth_test: { label: 'Authentication Bypass', color: 'red' },
    cors_test: { label: 'CORS Misconfiguration', color: 'orange' },
    ssrf_test: { label: 'SSRF', color: 'red' },
  }
  const meta = toolLabels[toolName] ?? { label: toolName, color: 'zinc' }
  const isVulnColor = meta.color === 'red' ? 'border-red-300 bg-red-50 text-red-900' : 'border-orange-300 bg-orange-50 text-orange-900'
  const safeColor = 'border-zinc-200 bg-zinc-50 text-zinc-600'

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', vulnerable ? isVulnColor : safeColor)}>
        {vulnerable
          ? <AlertTriangle className="h-4 w-4 shrink-0" />
          : <CheckCircle2  className="h-4 w-4 shrink-0" />}
        <p className="text-sm font-semibold">
          {vulnerable ? `${meta.label} Vulnerability Found` : `No ${meta.label} Detected`}
        </p>
      </div>

      {/* Findings list */}
      {(bypasses.length > 0) && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">Confirmed Findings</p>
          {bypasses.map((f, i) => (
            <div key={i} className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-1.5">
              {(f.test || f.type || f.probe) && (
                <p className="font-mono text-xs font-semibold text-rose-900">{f.test ?? f.type ?? f.probe}</p>
              )}
              {f.payload && <p className="font-mono text-[10px] text-rose-700 break-all">{f.payload}</p>}
              {f.severity && (
                <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">{f.severity.toUpperCase()}</span>
              )}
              {f.evidence && (
                <pre className="max-h-24 overflow-auto rounded-lg border border-rose-200 bg-rose-100/50 p-2 text-[10px] text-rose-900 leading-relaxed whitespace-pre-wrap">
                  {f.evidence.slice(0, 300)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {hint && (
        <p className={cn('text-xs leading-relaxed rounded-xl border p-3', vulnerable ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
          {hint}
        </p>
      )}

      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Directory Results
// ─────────────────────────────────────────────────────────────────────────────

function ADSection({ toolName, o, campaignUI }: { toolName: string; o: Record<string, unknown>; campaignUI: boolean }) {
  const users = Array.isArray(o.users) ? (o.users as string[]) : []
  const groups = Array.isArray(o.groups) ? (o.groups as string[]) : []
  const spns = Array.isArray(o.spnsFound) ? (o.spnsFound as string[]) : []
  const cracked = Array.isArray(o.cracked) ? (o.cracked as { hash: string; password: string }[]) : []
  const hashesObtained = o.hashesObtained === true
  const success = o.success === true || hashesObtained || cracked.length > 0
  const vulnerableUsers = Array.isArray(o.vulnerableUsers) ? (o.vulnerableUsers as string[]) : []
  const hint = typeof o.hint === 'string' ? o.hint : null
  const rawOutput = typeof o.rawOutput === 'string' ? o.rawOutput : null

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', success ? 'border-red-300 bg-red-50 text-red-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
        {toolName === 'ad_enum'        && <Users    className="h-4 w-4 shrink-0" />}
        {toolName === 'kerberoast'     && (success ? <LockOpen className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />)}
        {toolName === 'asreproast'     && (success ? <LockOpen className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />)}
        {toolName === 'pass_the_hash'  && (success ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />)}
        {toolName === 'password_crack' && (success ? <Key   className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />)}
        <div>
          <p className="text-sm font-semibold">
            {toolName === 'ad_enum' && `Found ${users.length} user(s), ${groups.length} group(s)`}
            {toolName === 'kerberoast' && (hashesObtained ? `TGS Hashes Captured — ${spns.length} SPN(s)` : 'No kerberoastable accounts found')}
            {toolName === 'asreproast' && (hashesObtained ? `AS-REP Hashes Captured — ${vulnerableUsers.length} vulnerable user(s)` : 'No vulnerable users found')}
            {toolName === 'pass_the_hash' && (success ? 'Lateral Movement Successful' : 'Pass-the-Hash Failed')}
            {toolName === 'password_crack' && (cracked.length > 0 ? `${cracked.length} Password(s) Cracked` : 'No passwords cracked')}
          </p>
        </div>
      </div>

      {/* Users found (ad_enum) */}
      {users.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3 text-zinc-400" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Domain Users ({users.length})</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {users.slice(0, 30).map(u => <span key={u} className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[10px] text-zinc-700">{u}</span>)}
            {users.length > 30 && <span className="text-[10px] text-zinc-400 italic">+{users.length - 30} more</span>}
          </div>
        </div>
      )}

      {/* Cracked passwords */}
      {cracked.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Key className="h-3 w-3 text-red-600" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-800">Cracked Credentials</p>
          </div>
          {cracked.map((c, i) => (
            <div key={i} className="flex items-center gap-2 font-mono text-xs text-red-900 py-0.5">
              <span className="font-semibold truncate max-w-[160px]">{c.hash}</span>
              <ArrowRight className="h-3 w-3 text-red-500 shrink-0" />
              <span className="font-bold">{c.password}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hash file obtained */}
      {hashesObtained && !!o.hashFile && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <Hash className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-900">Hashes saved to: <code className="font-mono font-semibold">{String(o.hashFile)}</code></p>
        </div>
      )}

      {!!hint && <p className="text-xs text-zinc-500 leading-relaxed">{hint}</p>}

      {!campaignUI && !!rawOutput && <ConsoleOutputBlock output={rawOutput.slice(0, 3000)} />}
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-Exploitation Results
// ─────────────────────────────────────────────────────────────────────────────

function PostExploitSection({ toolName, o, campaignUI }: { toolName: string; o: Record<string, unknown>; campaignUI: boolean }) {
  type Finding = { category: string; finding: string; severity: string }
  type Cred = { source: string; credential: string; type: string }
  const findings = Array.isArray(o.findings) ? (o.findings as Finding[]) : []
  const credentials = Array.isArray(o.credentials) ? (o.credentials as Cred[]) : []
  const hint = typeof o.hint === 'string' ? o.hint : null
  const hasHigh = findings.some(f => f.severity === 'high')

  return (
    <div className="space-y-4">
      {toolName === 'privesc_enum' && (
        <>
          <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', hasHigh ? 'border-red-300 bg-red-50 text-red-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
            {hasHigh ? <TrendingUp className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <p className="text-sm font-semibold">
              {hasHigh ? `${findings.filter(f => f.severity === 'high').length} High-Severity Escalation Path(s) Found` : `${findings.length} Finding(s) — No Critical PrivEsc`}
            </p>
          </div>
          {findings.length > 0 && (
            <div className="space-y-2">
              {findings.filter(f => f.severity !== 'info').map((f, i) => (
                <div key={i} className={cn('rounded-xl border p-3', f.severity === 'high' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60')}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {f.severity === 'high'
                      ? <Crosshair className="h-3 w-3 text-red-600 shrink-0" />
                      : <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', f.severity === 'high' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200')}>{f.severity}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{f.category}</span>
                  </div>
                  <pre className="text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">{f.finding.slice(0, 400)}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {toolName === 'cred_harvest' && (
        <>
          <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', credentials.length > 0 ? 'border-red-300 bg-red-50 text-red-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
            {credentials.length > 0 ? <Key className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
            <p className="text-sm font-semibold">
              {credentials.length > 0 ? `${credentials.length} Credential(s) Harvested` : 'No Credentials Found'}
            </p>
          </div>
          {credentials.length > 0 && (
            <div className="space-y-2">
              {credentials.map((c, i) => (
                <div key={i} className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileSearch className="h-3 w-3 text-zinc-400 shrink-0" />
                    <span className="rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-700">{c.source}</span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-500 capitalize">{c.type}</span>
                  </div>
                  <pre className="text-xs font-mono text-red-900 whitespace-pre-wrap leading-relaxed break-all">{c.credential.slice(0, 200)}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {hint && <p className="text-xs text-zinc-500 leading-relaxed">{hint}</p>}
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CVE Intel — Fetch Recent CVEs
// ─────────────────────────────────────────────────────────────────────────────

type CveItem = { id: string; description: string; cvssScore: number; severity: string; publishedAt: string; affectedProducts: string[] }

function CveListSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const cves = Array.isArray(o.cves) ? (o.cves as CveItem[]) : []
  const total = typeof o.total === 'number' ? o.total : cves.length

  const severityStyle = (s: string) => {
    if (s === 'critical') return 'border-red-300 bg-red-50 text-red-900'
    if (s === 'high') return 'border-orange-300 bg-orange-50 text-orange-900'
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }
  const scoreBadge = (s: string) => {
    if (s === 'critical') return 'bg-red-100 text-red-800 border border-red-300'
    if (s === 'high') return 'bg-orange-100 text-orange-800 border border-orange-200'
    return 'bg-amber-100 text-amber-800 border border-amber-200'
  }

  if (cves.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
        No CVEs matched the filter criteria.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">{total} CVE{total !== 1 ? 's' : ''} Found</span>
        <span className="text-[11px] text-zinc-400">{cves.filter(c => c.severity === 'critical').length} critical · {cves.filter(c => c.severity === 'high').length} high</span>
      </div>
      <div className="space-y-2">
        {cves.map(c => (
          <div key={c.id} className={cn('rounded-xl border p-3 space-y-1.5', severityStyle(c.severity))}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold">{c.id}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', scoreBadge(c.severity))}>
                {c.severity} {c.cvssScore.toFixed(1)}
              </span>
              <span className="text-[10px] text-zinc-400 ml-auto">{c.publishedAt ? new Date(c.publishedAt).toLocaleDateString() : ''}</span>
            </div>
            <p className="text-xs leading-relaxed line-clamp-3">{c.description}</p>
            {c.affectedProducts.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {c.affectedProducts.slice(0, 4).map((p, i) => (
                  <span key={i} className="rounded border border-zinc-200 bg-white/60 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">{p.split(':').slice(3, 6).join(' ') || p}</span>
                ))}
                {c.affectedProducts.length > 4 && <span className="text-[10px] text-zinc-400 italic">+{c.affectedProducts.length - 4} more</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CVE Intel — GitHub PoC Search
// ─────────────────────────────────────────────────────────────────────────────

type PoCRepo = { name: string; url: string; stars: number; description: string; pushedAt: string }

function GitHubPoCSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const found = o.found === true
  const repos = Array.isArray(o.repos) ? (o.repos as PoCRepo[]) : []

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', found ? 'border-red-300 bg-red-50 text-red-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
        {found ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        <p className="text-sm font-semibold">
          {found ? `${repos.length} Public PoC Repo${repos.length !== 1 ? 's' : ''} Found` : 'No Public PoC Found on GitHub'}
        </p>
      </div>
      {repos.map((r, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-zinc-800">{r.name}</span>
            {r.stars > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">★ {r.stars}</span>
            )}
            <span className="text-[10px] text-zinc-400 ml-auto">
              {r.pushedAt ? `Updated ${new Date(r.pushedAt).toLocaleDateString()}` : ''}
            </span>
          </div>
          {r.description && <p className="text-xs text-zinc-600 leading-relaxed">{r.description}</p>}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-[10px] text-blue-600 hover:underline break-all">{r.url}</a>
          )}
        </div>
      ))}
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CVE Intel — Exploit-DB Search
// ─────────────────────────────────────────────────────────────────────────────

type ExploitEntry = { id: string; url: string; description: string; source: string; date: string }

function ExploitDBSection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const found = o.found === true
  const exploits = Array.isArray(o.exploits) ? (o.exploits as ExploitEntry[]) : []
  const error = typeof o.error === 'string' ? o.error : null

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', found ? 'border-red-300 bg-red-50 text-red-900' : error ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
        {found ? <ShieldAlert className="h-4 w-4 shrink-0" /> : error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        <p className="text-sm font-semibold">
          {found ? `${exploits.length} Public Exploit${exploits.length !== 1 ? 's' : ''} Found` : error ? 'Search Error' : 'No Public Exploits Found'}
        </p>
      </div>
      {!!error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}
      {exploits.map((e, i) => (
        <div key={i} className="rounded-xl border border-red-200 bg-red-50/40 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={cn('rounded border px-2 py-0.5 text-[10px] font-bold uppercase', e.source === 'exploitdb' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-zinc-200 bg-zinc-100 text-zinc-700')}>{e.source}</span>
            <span className="text-[10px] text-zinc-400">{e.date ? new Date(e.date).toLocaleDateString() : ''}</span>
          </div>
          <p className="text-xs text-zinc-800 leading-relaxed">{e.description}</p>
          {e.url && (
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-[10px] text-blue-600 hover:underline break-all">{e.url}</a>
          )}
        </div>
      ))}
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CVE Intel — Assess Applicability
// ─────────────────────────────────────────────────────────────────────────────

type ApplicableHost = { ip: string; hostname?: string; matchedService: string }

function ApplicabilitySection({ o, campaignUI }: { o: Record<string, unknown>; campaignUI: boolean }) {
  const applicable = o.applicable === true
  const cveId = typeof o.cveId === 'string' ? o.cveId : null
  const hosts = Array.isArray(o.applicableHosts) ? (o.applicableHosts as ApplicableHost[]) : []
  const totalScanned = typeof o.totalHostsScanned === 'number' ? o.totalHostsScanned : null

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', applicable ? 'border-red-300 bg-red-50 text-red-900' : 'border-green-200 bg-green-50 text-green-800')}>
        {applicable ? <Crosshair className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        <div>
          <p className="text-sm font-semibold">
            {applicable ? `${hosts.length} Applicable Host${hosts.length !== 1 ? 's' : ''} Found` : 'No Applicable Hosts'}
          </p>
          {totalScanned !== null && (
            <p className="text-[11px] opacity-75">{totalScanned} host{totalScanned !== 1 ? 's' : ''} scanned{cveId ? ` for ${cveId}` : ''}</p>
          )}
        </div>
      </div>
      {hosts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">Vulnerable Hosts</p>
          {hosts.map((h, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/40 px-3 py-2">
              <span className="font-mono text-xs font-bold text-red-900">{h.ip}</span>
              {h.hostname && <span className="text-xs text-zinc-600">{h.hostname}</span>}
              <span className="ml-auto rounded border border-red-200 bg-white px-2 py-0.5 font-mono text-[10px] text-red-800">{h.matchedService}</span>
            </div>
          ))}
        </div>
      )}
      {!campaignUI && <JsonDetails data={o} />}
    </div>
  )
}

export function AuditOutputCell({
  toolName,
  output,
  input,
  presentation = 'full',
}: {
  toolName: string
  output: unknown
  /** When provided, enables report_finding / close_campaign structured views */
  input?: unknown
  /** campaign: hide raw JSON, prose-style summaries, no code blocks where possible */
  presentation?: AuditOutputPresentation
}) {
  const campaignUI = presentation === 'campaign'
  const o = parseOutput(output)
  const inp = parseOutput(input) ?? {}

  if (!o) {
    const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    if (campaignUI) {
      return (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 text-sm leading-relaxed text-zinc-800">
          <p className="whitespace-pre-wrap">{raw}</p>
        </div>
      )
    }
    return (
      <div className="max-h-48 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-700">{raw}</pre>
      </div>
    )
  }

  // ── Metasploit & command tools ──
  if (toolName === 'run_exploit') {
    return <MsfExploitSection o={o} inp={inp} campaignUI={campaignUI} />
  }

  if (toolName === 'run_msf_command' || toolName === 'msf_search') {
    return <MsfCommandSection o={o} inp={inp} campaignUI={campaignUI} />
  }

  if (toolName === 'run_command') {
    return <CommandOutputSection o={o} inp={inp} campaignUI={campaignUI} />
  }

  if (toolName === 'searchsploit') {
    return <SearchsploitSection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'web_tech_detect') {
    return <WebTechSection o={o} campaignUI={campaignUI} />
  }

  if (['lfi_test', 'xss_scan', 'auth_test', 'cors_test', 'ssrf_test'].includes(toolName)) {
    return <WebAttackSection toolName={toolName} o={o} campaignUI={campaignUI} />
  }

  if (['ad_enum', 'kerberoast', 'asreproast', 'pass_the_hash', 'password_crack'].includes(toolName)) {
    return <ADSection toolName={toolName} o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'privesc_enum' || toolName === 'cred_harvest') {
    return <PostExploitSection toolName={toolName} o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'fetch_recent_cves') {
    return <CveListSection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'search_github_poc') {
    return <GitHubPoCSection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'search_exploitdb') {
    return <ExploitDBSection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'assess_applicability') {
    return <ApplicabilitySection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'nmap_scan') {
    return <NmapSection o={o} campaignUI={campaignUI} />
  }

  if (toolName === 'report_finding') {
    return <ReportFindingSection input={inp} output={o} campaignUI={campaignUI} />
  }

  if (toolName === 'close_campaign') {
    return <CloseCampaignSection input={inp} output={o} campaignUI={campaignUI} />
  }

  if (toolName === 'create_campaign') {
    return <CreateCampaignSection input={inp} campaignUI={campaignUI} />
  }

  if (toolName === 'update_campaign') {
    return <UpdateCampaignSection input={inp} campaignUI={campaignUI} />
  }

  if (
    typeof o.summary === 'string' ||
    Array.isArray(o.keyFindings) ||
    Array.isArray(o.discoveries) ||
    typeof o.injectable === 'boolean' ||
    typeof o.textOverview === 'string'
  ) {
    return <GenericScannerSection toolName={toolName} o={o} campaignUI={campaignUI} />
  }

  if (typeof o.result === 'string') {
    return (
      <div className="space-y-3">
        <ResultBlock title="Result" text={o.result} campaignUI={campaignUI} />
        {!campaignUI && <JsonDetails data={o} />}
      </div>
    )
  }

  if (typeof o.response === 'string') {
    return (
      <div className="space-y-3">
        <ResultBlock title="Agent Response" text={o.response} campaignUI={campaignUI} />
        {!campaignUI && <JsonDetails data={o} />}
      </div>
    )
  }

  if (typeof inp.request === 'string' && !campaignUI) {
    return (
      <div className="space-y-3">
        <ResultBlock title="Request" text={inp.request} campaignUI={false} />
        <JsonDetails data={o} />
      </div>
    )
  }

  if (campaignUI) {
    const human = humanizeOutputForCampaign(o, inp)
    if (human) {
      return <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-4 text-sm text-zinc-800">{human}</div>
    }
    const entries = Object.entries(o).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length > 0) {
      return (
        <dl className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-4 text-sm">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium capitalize text-zinc-500">{k.replace(/_/g, ' ')}</dt>
              <dd className="mt-0.5 text-zinc-800">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )
    }
    return (
      <p className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-4 text-[12px] font-mono whitespace-pre-wrap text-zinc-600">
        {JSON.stringify(o, null, 2)}
      </p>
    )
  }

  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-800">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  )
}

/** Best-effort non-JSON display for campaign mode fallbacks */
function humanizeOutputForCampaign(o: Record<string, unknown>, _inp: Record<string, unknown>): ReactNode | null {
  if (typeof o.updated === 'boolean' && o.updated) {
    return <p className="text-zinc-700">Campaign status updated.</p>
  }
  if (typeof o.findingId === 'string') {
    return <p className="leading-relaxed text-zinc-700">Finding saved successfully.</p>
  }
  return null
}
