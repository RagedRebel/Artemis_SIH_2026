export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type CampaignStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed'
export type FindingStatus = 'open' | 'accepted_risk' | 'remediated'
export type CVEStatus = 'new' | 'assessing' | 'queued' | 'testing' | 'tested' | 'not_applicable'
export type PocSource = 'exploitdb' | 'github' | 'manual'
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'false_positive'

export interface Campaign {
  id: string
  name: string
  targetScope: string[]
  status: CampaignStatus
  maxRiskLevel: RiskLevel
  createdBy: string
  startedAt?: Date
  endedAt?: Date
  findingsCount: number
}

export interface Finding {
  id: string
  campaignId: string
  cveId?: string
  title: string
  description: string
  affectedHost: string
  affectedService: string
  cvssScore: number
  severity: Severity
  evidence: Record<string, unknown>
  remediation: string
  status: FindingStatus
  createdAt: Date
}

export interface CVEQueueItem {
  cveId: string
  cvssScore: number
  description: string
  affectedProducts: string[]
  pocUrl?: string
  pocSource?: PocSource
  applicableHosts: string[]
  status: CVEStatus
  testFindingId?: string
  fetchedAt: Date
}

export interface ApprovalRequest {
  id: string
  campaignId: string
  agentName: string
  actionDescription: string
  command: string
  riskLevel: RiskLevel
  context: Record<string, unknown>
  status: ApprovalStatus
  requestedAt: Date
  respondedAt?: Date
  respondedBy?: string
}

export interface WazuhAlert {
  id: string
  timestamp: Date
  agentId: string
  agentName: string
  ruleId: number
  ruleDescription: string
  ruleMitre?: { id: string; tactic: string; technique: string }[]
  severity: number
  srcIp?: string
  dstIp?: string
  rawLog: string
}

export interface Incident {
  id: string
  title: string
  description: string
  severity: Severity
  status: IncidentStatus
  alertIds: string[]
  mitreTechniques: string[]
  affectedHosts: string[]
  createdAt: Date
  resolvedAt?: Date
}

export interface NetworkHost {
  ip: string
  hostname?: string
  openPorts: PortInfo[]
  os?: string
  discoveredAt: Date
}

export interface PortInfo {
  port: number
  protocol: 'tcp' | 'udp'
  service: string
  version?: string
  state: 'open' | 'filtered' | 'closed'
}

export interface AuditLogEntry {
  id: string
  timestamp: Date
  agentName: string
  toolName: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  campaignId?: string
  durationMs: number
}
