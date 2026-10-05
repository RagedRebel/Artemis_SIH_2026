/** Title-case each snake segment: close_campaign → Close Campaign */
export function titleCaseSnake(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Display name for audit agents: red_team_agent → Red Team Agent */
export function formatAuditAgentName(agentName: string): string {
  const s = agentName?.trim()
  if (!s) return '—'
  return titleCaseSnake(s)
}

const TOOL_LABEL_OVERRIDES: Record<string, string> = {
  // Metasploit
  run_exploit: 'MSF Exploit',
  run_msf_command: 'MSF Console',
  msf_search: 'MSF Search',
  msf_session_cleanup: 'MSF Cleanup',
  // Scanning
  nmap_scan: 'Nmap Scan',
  sqlmap_scan: 'SQLMap',
  gobuster_scan: 'Gobuster',
  nuclei_scan: 'Nuclei',
  nikto_scan: 'Nikto',
  searchsploit: 'SearchSploit',
  // Web application attacks
  web_tech_detect: 'Tech Detection',
  lfi_test: 'LFI Test',
  xss_scan: 'XSS Scan',
  auth_test: 'Auth Bypass Test',
  cors_test: 'CORS Test',
  ssrf_test: 'SSRF Test',
  // Active Directory
  ad_enum: 'AD Enumeration',
  kerberoast: 'Kerberoasting',
  asreproast: 'AS-REP Roast',
  pass_the_hash: 'Pass-the-Hash',
  password_crack: 'Password Crack',
  // Post-exploitation
  privesc_enum: 'PrivEsc Enum',
  cred_harvest: 'Cred Harvest',
  // Command execution
  run_command: 'Shell Command',
  start_listener: 'Start Listener',
  check_listener: 'Check Listener',
  kill_listener: 'Kill Listener',
  get_local_ip: 'Local IP',
  // CVE Intel
  fetch_recent_cves: 'Fetch Recent CVEs',
  search_exploitdb: 'Exploit-DB Search',
  search_github_poc: 'GitHub PoC Search',
  assess_applicability: 'Assess Applicability',
  // Blue Team
  suggest_detection_rule: 'Detection Rule',
  get_wazuh_alerts: 'Wazuh Alerts',
  respond_to_incident: 'Blue Team Response',
  correlate_events: 'Event Correlation',
}

export function auditToolTitle(toolName: string): string {
  return TOOL_LABEL_OVERRIDES[toolName] ?? titleCaseSnake(toolName)
}
