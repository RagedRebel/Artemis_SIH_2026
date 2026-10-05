/**
 * MSF Module Validator
 *
 * Pre-flight checks before run_exploit() actually executes. Catches the most
 * common agent mistakes: wrong module type, SSL mismatch, OS platform mismatch,
 * using a handler/scanner as an exploit. Returns structured errors and warnings
 * so the agent can self-correct before wasting a 180-second exploit timeout.
 */

import { resolvePortProtocol } from './port-protocol.js'

export interface ModuleValidation {
  valid: boolean
  errors: string[]      // Hard blocks — do NOT run the exploit
  warnings: string[]    // Soft alerts — may still work but agent should be aware
  suggestions: string[] // Actionable hints for the agent to fix the issue
}

/**
 * Validate an MSF module path before executing it as an exploit.
 *
 * @param module      Full MSF module path, e.g. 'exploit/unix/ftp/vsftpd_234_backdoor'
 * @param port        Target port number (used for SSL/protocol validation)
 * @param targetOS    OS string from nmap OS detection, e.g. 'Linux 4.15', 'Windows Server 2016'
 * @param nmapTags    nmap service tags for the port, e.g. ['ssl', 'http']
 * @param payload     Payload string if provided (optional)
 * @param options     Additional MSF options the agent wants to set
 */
export function validateMsfModule(
  module: string,
  port?: number,
  targetOS?: string,
  nmapTags: string[] = [],
  payload?: string,
  options: Record<string, string> = {},
): ModuleValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  const moduleLower = module.toLowerCase()

  // ── Rule 1: Must be an actual module path (not empty/placeholder) ──────────
  if (!module || module.trim().length === 0) {
    errors.push('Module path is empty. Run msf_search first to find the correct module.')
    return { valid: false, errors, warnings, suggestions }
  }

  // ── Rule 2: Scanner modules cannot be run as exploits ─────────────────────
  if (moduleLower.startsWith('auxiliary/scanner')) {
    errors.push(
      `"${module}" is a SCANNER (auxiliary/scanner/*), not an exploit. ` +
      `Use run_msf_command("use ${module}") then run_msf_command("run") instead of run_exploit.`,
    )
    suggestions.push('Switch to run_msf_command for scanner/auxiliary modules.')
  }

  // ── Rule 3: multi/handler is a listener, not an exploit ───────────────────
  if (moduleLower === 'exploit/multi/handler' || moduleLower === 'multi/handler') {
    errors.push(
      'exploit/multi/handler is a LISTENER, not an exploit. ' +
      'Use start_listener tool for catch-and-hold payloads.',
    )
    suggestions.push('Use start_listener("nc -lvnp 4444") to set up a listener instead.')
  }

  // ── Rule 4: SSL / port-protocol mismatch ─────────────────────────────────
  if (port !== undefined) {
    const proto = resolvePortProtocol(port, nmapTags)

    // Module name contains "ssl" but port is plain HTTP
    const moduleRequiresSSL = moduleLower.includes('ssl') || moduleLower.includes('https')
    if (moduleRequiresSSL && !proto.isSSL) {
      errors.push(
        `Module "${module}" appears to require SSL/TLS, but port ${port} is plain HTTP. ` +
        `Either target port 443/8443, or use a non-SSL variant of this module.`,
      )
      suggestions.push(
        `If the target DOES speak HTTPS on port ${port}, add nmapTags: ["ssl"] when calling this tool.`,
      )
    }

    // Module is for HTTP but port is HTTPS and agent hasn't set SSL=true
    const moduleIsHTTP = moduleLower.includes('http') && !moduleRequiresSSL
    if (moduleIsHTTP && proto.isSSL && !options['SSL'] && !options['ssl']) {
      warnings.push(
        `Port ${port} speaks HTTPS but SSL option is not set. ` +
        `This may cause a "connection refused" or TLS handshake failure.`,
      )
      suggestions.push(`Add options: { SSL: "true" } to your run_exploit call (auto-set by the tool if port is detected).`)
    }

    // Agent manually set SSL=true on an HTTP port
    const agentSetSSLTrue = options['SSL']?.toLowerCase() === 'true' || options['ssl']?.toLowerCase() === 'true'
    if (agentSetSSLTrue && !proto.isSSL) {
      warnings.push(
        `SSL is set to "true" but port ${port} appears to be plain HTTP. ` +
        `This will likely cause a TLS handshake error.`,
      )
      suggestions.push(`Remove SSL: "true" from options, or verify the service actually speaks HTTPS on port ${port}.`)
    }
  }

  // ── Rule 5: OS platform mismatch ─────────────────────────────────────────
  if (targetOS) {
    const osLower = targetOS.toLowerCase()
    const isLinuxTarget = osLower.includes('linux') || osLower.includes('unix') || osLower.includes('ubuntu') || osLower.includes('debian')
    const isWindowsTarget = osLower.includes('windows') || osLower.includes('win32') || osLower.includes('win64')

    if (isLinuxTarget && (moduleLower.includes('/windows/') && !moduleLower.includes('multi'))) {
      errors.push(
        `Module "${module}" targets Windows but nmap identified the target OS as "${targetOS}". ` +
        `This exploit will almost certainly fail.`,
      )
      suggestions.push(`Search for a Linux-compatible module: msf_search("type:exploit platform:linux <service>")`)
    }

    if (isWindowsTarget && (moduleLower.includes('/unix/') || moduleLower.includes('/linux/'))) {
      errors.push(
        `Module "${module}" targets Unix/Linux but nmap identified the target OS as "${targetOS}". ` +
        `This exploit will almost certainly fail.`,
      )
      suggestions.push(`Search for a Windows-compatible module: msf_search("type:exploit platform:windows <service>")`)
    }
  }

  // ── Rule 6: Payload sanity checks ─────────────────────────────────────────
  if (payload) {
    const payloadLower = payload.toLowerCase()

    // Reverse payload without LHOST set (agent should rely on auto-detect but warn)
    if (payloadLower.includes('reverse') && !options['LHOST'] && !options['lhost']) {
      warnings.push(
        `Payload "${payload}" needs LHOST for the reverse connection. ` +
        `LHOST will be auto-detected from Kali's network interface — ensure it's reachable from the target.`,
      )
    }

    // Bind payload with skipLhost not set
    if (payloadLower.includes('bind') && options['LHOST']) {
      warnings.push(
        `Payload "${payload}" is a BIND payload — the target connects back to itself. ` +
        `LHOST is not needed for bind payloads and may confuse the module.`,
      )
      suggestions.push(`Remove LHOST from options and set skipLhost: true in run_exploit.`)
    }

    // cmd/unix/interact needs skipLhost
    if (payloadLower === 'cmd/unix/interact' && options['LHOST']) {
      warnings.push(
        `cmd/unix/interact is an interactive payload that does not need LHOST. ` +
        `Remove LHOST or set skipLhost: true.`,
      )
    }
  }

  // ── Rule 7: Warn about modules that need TARGETURI ────────────────────────
  const needsTargetUri = ['tomcat', 'jenkins', 'drupal', 'wordpress', 'struts', 'weblogic', 'jboss']
  if (needsTargetUri.some(svc => moduleLower.includes(svc)) && !options['TARGETURI'] && !options['targeturi']) {
    warnings.push(
      `Module "${module}" likely requires TARGETURI to be set (the path to the web app). ` +
      `Run run_msf_command("show options") to check required options before exploiting.`,
    )
    suggestions.push(`Run run_msf_command("show options") and set TARGETURI if it shows as required.`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  }
}
