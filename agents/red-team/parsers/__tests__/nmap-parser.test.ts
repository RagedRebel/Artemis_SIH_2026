import { describe, it, expect } from 'vitest'
import { NmapParser } from '../nmap-parser.js'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun>
  <host starttime="1234567890">
    <address addr="192.168.1.1" addrtype="ipv4"/>
    <hostnames><hostname name="gateway" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open" reason="syn-ack"/>
        <service name="ssh" product="OpenSSH" version="8.9p1"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open" reason="syn-ack"/>
        <service name="http" product="Apache httpd" version="2.4.49"/>
      </port>
      <port protocol="tcp" portid="443">
        <state state="filtered" reason="no-response"/>
        <service name="https"/>
      </port>
    </ports>
    <os><osmatch name="Linux 5.x"/></os>
  </host>
  <host>
    <address addr="192.168.1.2" addrtype="ipv4"/>
    <ports>
      <port protocol="tcp" portid="3306">
        <state state="open" reason="syn-ack"/>
        <service name="mysql" product="MySQL" version="5.7"/>
      </port>
    </ports>
  </host>
</nmaprun>`

describe('NmapParser', () => {
  it('should parse hosts from XML', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts).toHaveLength(2)
  })

  it('should extract IP addresses', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts[0].ip).toBe('192.168.1.1')
    expect(hosts[1].ip).toBe('192.168.1.2')
  })

  it('should extract hostname', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts[0].hostname).toBe('gateway')
  })

  it('should extract OS', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts[0].os).toBe('Linux 5.x')
  })

  it('should extract only open ports', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts[0].openPorts).toHaveLength(2)
    expect(hosts[0].openPorts[0].port).toBe(22)
    expect(hosts[0].openPorts[0].service).toBe('ssh')
    expect(hosts[0].openPorts[1].port).toBe(80)
  })

  it('should extract service versions', () => {
    const hosts = NmapParser.parseXml(SAMPLE_XML)
    expect(hosts[0].openPorts[0].version).toBe('OpenSSH 8.9p1')
    expect(hosts[0].openPorts[1].version).toBe('Apache httpd 2.4.49')
  })

  it('should handle empty XML', () => {
    const hosts = NmapParser.parseXml('<nmaprun></nmaprun>')
    expect(hosts).toHaveLength(0)
  })
})
