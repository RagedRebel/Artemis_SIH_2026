import { wazuhFetch } from './wazuh.js'

export async function syscollectorProcesses(agentId: string, limit = 100): Promise<unknown[]> {
  const r = await wazuhFetch(`/syscollector/${agentId}/processes?limit=${limit}`)
  return r?.data?.affected_items ?? []
}

export async function syscollectorPorts(agentId: string, limit = 100): Promise<unknown[]> {
  const r = await wazuhFetch(`/syscollector/${agentId}/ports?limit=${limit}`)
  return r?.data?.affected_items ?? []
}

export async function syscollectorPackages(agentId: string, limit = 200): Promise<unknown[]> {
  const r = await wazuhFetch(`/syscollector/${agentId}/packages?limit=${limit}`)
  return r?.data?.affected_items ?? []
}

export async function syscollectorHardware(agentId: string): Promise<unknown> {
  const r = await wazuhFetch(`/syscollector/${agentId}/hardware`)
  return r?.data?.affected_items?.[0] ?? null
}

export async function syscollectorNetiface(agentId: string): Promise<unknown[]> {
  const r = await wazuhFetch(`/syscollector/${agentId}/netiface`)
  return r?.data?.affected_items ?? []
}

export async function syscollectorHotfixes(agentId: string): Promise<unknown[]> {
  const r = await wazuhFetch(`/syscollector/${agentId}/hotfixes`)
  return r?.data?.affected_items ?? []
}
