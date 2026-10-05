/**
 * Port-Protocol Resolver
 *
 * Single source of truth for: given a port + nmap service tags, what protocol
 * does this service speak? Used by every web/scanning tool to auto-configure
 * SSL, URL scheme, and MSF SSL option — eliminating the class of bugs where
 * the agent runs SSL modules on port 80 or plain-HTTP tools on port 443.
 */

export interface PortProtocolResult {
  /** True if the service speaks TLS/SSL */
  isSSL: boolean
  /** URL scheme for web tools */
  scheme: 'http' | 'https' | 'ftp' | 'ftps' | 'tcp' | 'udp'
  /**
   * Value to set for MSF `SSL` option.
   * null = module likely doesn't use SSL option (non-HTTP protocols)
   */
  msfSSLOption: boolean | null
  /** Scheme string for gobuster -u flag */
  gobusterScheme: string
  /** Extra flags to append to nikto command */
  niktoFlags: string[]
  /** Extra flags for gobuster (e.g. -k to skip TLS cert validation) */
  gobusterFlags: string[]
}

/**
 * Ports that are definitively HTTPS regardless of service name.
 * These are IANA-registered or universally accepted SSL/TLS ports.
 */
const HTTPS_PORTS = new Set([443, 4443, 8443, 9443, 8444, 9444, 8843, 18443, 7443])

/**
 * Ports that are definitively HTTP (plain, no TLS).
 * Even if an app happens to serve HTTPS on these, the default is plaintext.
 */
const HTTP_PORTS = new Set([80, 81, 8080, 8000, 8001, 8008, 8888, 3000, 4000, 5000, 6000, 7000, 9000, 9090, 3128])

/**
 * Derive protocol context from port number and nmap-reported service tags.
 *
 * Priority:
 *   1. nmap service tags (most accurate — nmap performs TLS handshake)
 *   2. Port number lookup table
 *   3. Conservative fallback: plain TCP, no SSL
 *
 * @param port         The TCP/UDP port number of the service
 * @param nmapTags     Array of nmap service strings, e.g. ['ssl', 'http', 'X.509']
 *                     These come from nmap's <service tunnel="ssl"> or the service name.
 */
export function resolvePortProtocol(
  port: number,
  nmapTags: string[] = [],
): PortProtocolResult {
  // ── 1. Parse nmap tags (highest priority) ──────────────────────────────────
  const tagStr = nmapTags.map(t => t.toLowerCase()).join(' ')
  const nmapSaysSSL = tagStr.includes('ssl') || tagStr.includes('tls') || tagStr.includes('https')
  const nmapSaysHTTP = tagStr.includes('http') && !nmapSaysSSL

  // nmap explicitly detected TLS
  if (nmapSaysSSL) {
    return makeHTTPS()
  }

  // ── 2. nmap says HTTP on a port we'd otherwise assume is HTTPS ─────────────
  // Trust nmap — some apps serve HTTP on 8443 etc.
  if (nmapSaysHTTP && HTTPS_PORTS.has(port)) {
    return makeHTTP()
  }

  // ── 3. Port lookup table ───────────────────────────────────────────────────
  if (HTTPS_PORTS.has(port)) return makeHTTPS()
  if (HTTP_PORTS.has(port))  return makeHTTP()

  // ── 4. FTP / FTPS ──────────────────────────────────────────────────────────
  if (port === 990) return makeFTPS()
  if (port === 21)  return makeFTP()

  // ── 5. Unknown port: conservative fallback ─────────────────────────────────
  // If nmap says it's HTTP-like but unknown port, trust nmap
  if (nmapSaysHTTP) return makeHTTP()

  return {
    isSSL: false,
    scheme: 'tcp',
    msfSSLOption: null,
    gobusterScheme: 'http',
    niktoFlags: [],
    gobusterFlags: [],
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHTTPS(): PortProtocolResult {
  return {
    isSSL: true,
    scheme: 'https',
    msfSSLOption: true,
    gobusterScheme: 'https',
    niktoFlags: ['-ssl'],
    gobusterFlags: ['-k'], // skip TLS cert verification (self-signed common in pentest labs)
  }
}

function makeHTTP(): PortProtocolResult {
  return {
    isSSL: false,
    scheme: 'http',
    msfSSLOption: false,
    gobusterScheme: 'http',
    niktoFlags: [],
    gobusterFlags: [],
  }
}

function makeFTP(): PortProtocolResult {
  return {
    isSSL: false,
    scheme: 'ftp',
    msfSSLOption: false,
    gobusterScheme: 'ftp',
    niktoFlags: [],
    gobusterFlags: [],
  }
}

function makeFTPS(): PortProtocolResult {
  return {
    isSSL: true,
    scheme: 'ftps',
    msfSSLOption: true,
    gobusterScheme: 'ftps',
    niktoFlags: [],
    gobusterFlags: [],
  }
}

/**
 * Quick helper: return a full base URL for a web target.
 * Used by tools that need a complete URL rather than scheme + host separately.
 */
export function buildTargetUrl(
  host: string,
  port: number,
  nmapTags: string[] = [],
  path = '/',
): string {
  const { scheme } = resolvePortProtocol(port, nmapTags)
  const effectiveScheme = ['http', 'https'].includes(scheme) ? scheme : 'http'
  const portSuffix =
    (effectiveScheme === 'http' && port === 80) ||
    (effectiveScheme === 'https' && port === 443)
      ? ''
      : `:${port}`
  return `${effectiveScheme}://${host}${portSuffix}${path}`
}
