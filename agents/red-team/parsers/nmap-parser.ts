import type { NetworkHost, PortInfo } from '../../shared/types.js'

export class NmapParser {
  static parseXml(xml: string): NetworkHost[] {
    const hosts: NetworkHost[] = []
    const hostRegex = /<host\b[^>]*>([\s\S]*?)<\/host>/g
    let hostMatch: RegExpExecArray | null

    while ((hostMatch = hostRegex.exec(xml)) !== null) {
      const hostBlock = hostMatch[1]

      const addrMatch = hostBlock.match(/<address\s+addr="([^"]+)"\s+addrtype="ipv4"/)
      if (!addrMatch) continue

      const ip = addrMatch[1]
      const hostnameMatch = hostBlock.match(/<hostname\s+name="([^"]+)"/)
      const hostname = hostnameMatch?.[1]

      const osMatch = hostBlock.match(/<osmatch\s+name="([^"]+)"/)
      const os = osMatch?.[1]

      const ports: PortInfo[] = []
      const portRegex = /<port\s+protocol="([^"]+)"\s+portid="(\d+)">([\s\S]*?)<\/port>/g
      let portMatch: RegExpExecArray | null

      while ((portMatch = portRegex.exec(hostBlock)) !== null) {
        const protocol = portMatch[1] as 'tcp' | 'udp'
        const port = parseInt(portMatch[2], 10)
        const portBlock = portMatch[3]

        const stateMatch = portBlock.match(/<state\s+state="([^"]+)"/)
        const state = (stateMatch?.[1] ?? 'open') as PortInfo['state']

        const serviceMatch = portBlock.match(/<service\s+name="([^"]*)"(?:\s+product="([^"]*)")?(?:\s+version="([^"]*)")?/)
        const service = serviceMatch?.[1] ?? 'unknown'
        const product = serviceMatch?.[2] ?? ''
        const version = serviceMatch?.[3]
        const fullVersion = [product, version].filter(Boolean).join(' ') || undefined

        ports.push({ port, protocol, service, version: fullVersion, state })
      }

      hosts.push({
        ip,
        hostname,
        os,
        openPorts: ports.filter(p => p.state === 'open'),
        discoveredAt: new Date(),
      })
    }

    return hosts
  }
}
