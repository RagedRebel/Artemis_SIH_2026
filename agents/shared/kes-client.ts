const KES_URL = process.env.KES_URL ?? 'http://localhost:8001'
const KES_SECRET = process.env.KES_SECRET ?? ''

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-secret': KES_SECRET,
}

export interface ExecResult {
  command: string
  stdout: string
  stderr: string
  returncode: number
  timedOut: boolean
}

export interface MsfRunResult {
  command: string
  output: string
  promptMatched?: string
  success: boolean
  error?: string
}

export interface BackgroundJob {
  jobId: string
  pid: number
  command: string
}

export interface BackgroundJobStatus {
  jobId: string
  status: 'running' | 'finished'
  pid?: number
  returncode?: number
  output?: string
}

// ── Command Execution ────────────────────────────────────────────

export async function kesExec(command: string, timeout = 60): Promise<ExecResult> {
  const res = await fetch(`${KES_URL}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command, timeout }),
  })
  if (!res.ok) {
    const err = await res.json() as { detail?: string }
    throw new Error(`KES error ${res.status}: ${err.detail}`)
  }
  return res.json() as Promise<ExecResult>
}

export async function kesStream(command: string): Promise<ReadableStream<string>> {
  const res = await fetch(`${KES_URL}/execute/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command }),
  })
  if (!res.ok) throw new Error(`KES stream error: ${res.status}`)
  return res.body!.pipeThrough(new TextDecoderStream())
}

// ── Background Jobs (listeners, long-running tools) ──────────────

export async function kesStartBackground(command: string): Promise<BackgroundJob> {
  const res = await fetch(`${KES_URL}/execute/background`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command }),
  })
  if (!res.ok) {
    const err = await res.json() as { detail?: string }
    throw new Error(`KES background error ${res.status}: ${err.detail}`)
  }
  return res.json() as Promise<BackgroundJob>
}

export async function kesBackgroundStatus(jobId: string): Promise<BackgroundJobStatus> {
  const res = await fetch(`${KES_URL}/execute/background/${jobId}`, { headers })
  if (!res.ok) throw new Error(`KES background status error: ${res.status}`)
  return res.json() as Promise<BackgroundJobStatus>
}

export async function kesKillBackground(jobId: string): Promise<void> {
  await fetch(`${KES_URL}/execute/background/${jobId}`, {
    method: 'DELETE',
    headers,
  })
}

// ── Network Info ─────────────────────────────────────────────────

let _cachedLhost: string | null = null

export async function kesGetLhost(): Promise<string | null> {
  if (_cachedLhost) return _cachedLhost
  try {
    const res = await fetch(`${KES_URL}/network/lhost`, { headers })
    if (!res.ok) return null
    const data = await res.json() as { lhost: string | null; all_ips: string[] }
    _cachedLhost = data.lhost
    return data.lhost
  } catch {
    return null
  }
}

export async function kesGetInterfaces(): Promise<string[]> {
  try {
    const res = await fetch(`${KES_URL}/network/interfaces`, { headers })
    if (!res.ok) return []
    const data = await res.json() as { interfaces: string[] }
    return data.interfaces
  } catch {
    return []
  }
}

// ── Metasploit Session Management ────────────────────────────────

export async function msfStart(): Promise<string> {
  const res = await fetch(`${KES_URL}/msf/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })
  const data = await res.json() as { session_id: string }
  return data.session_id
}

export async function msfRun(
  sessionId: string,
  command: string,
  customPrompt?: string,
  timeout?: number
): Promise<MsfRunResult> {
  const res = await fetch(`${KES_URL}/msf/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      command,
      custom_prompt: customPrompt,
      timeout,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    return {
      command,
      output: '',
      success: false,
      error: `KES HTTP Error ${res.status}: ${err.detail || res.statusText}`,
    }
  }
  return res.json() as Promise<MsfRunResult>
}

export async function msfClose(sessionId: string): Promise<void> {
  await fetch(`${KES_URL}/msf/session/${sessionId}`, {
    method: 'DELETE',
    headers,
  })
}
