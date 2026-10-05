import { describe, it, expect } from 'vitest'
import { NucleiParser } from '../nuclei-parser.js'

const SAMPLE_JSONL = `{"template-id":"CVE-2021-41773","info":{"name":"Apache HTTP Server Path Traversal","severity":"critical","description":"A flaw in Apache httpd allows path traversal.","reference":["https://nvd.nist.gov/vuln/detail/CVE-2021-41773"],"tags":["cve","apache","rce"]},"type":"http","host":"http://172.30.0.12","matched-at":"http://172.30.0.12/icons/.%2e/%2e%2e/etc/passwd","ip":"172.30.0.12","timestamp":"2025-01-01T10:00:00Z","curl-command":"curl http://172.30.0.12/icons/.%2e/%2e%2e/etc/passwd"}
{"template-id":"tech-detect:apache","info":{"name":"Apache Detection","severity":"info"},"type":"http","host":"http://172.30.0.12","matched":"http://172.30.0.12","timestamp":"2025-01-01T10:00:01Z"}
this is not valid json
`

describe('NucleiParser', () => {
  it('should parse JSONL output', () => {
    const results = NucleiParser.parseJsonl(SAMPLE_JSONL)
    expect(results).toHaveLength(2)
  })

  it('should extract template ID', () => {
    const results = NucleiParser.parseJsonl(SAMPLE_JSONL)
    expect(results[0].templateId).toBe('CVE-2021-41773')
  })

  it('should extract severity', () => {
    const results = NucleiParser.parseJsonl(SAMPLE_JSONL)
    expect(results[0].info.severity).toBe('critical')
    expect(results[1].info.severity).toBe('info')
  })

  it('should extract host and matched URL', () => {
    const results = NucleiParser.parseJsonl(SAMPLE_JSONL)
    expect(results[0].host).toBe('http://172.30.0.12')
    expect(results[0].matched).toContain('etc/passwd')
  })

  it('should extract curl command', () => {
    const results = NucleiParser.parseJsonl(SAMPLE_JSONL)
    expect(results[0].curl).toContain('curl')
  })

  it('should skip invalid JSON lines', () => {
    const results = NucleiParser.parseJsonl('not json\n{broken\n')
    expect(results).toHaveLength(0)
  })

  it('should handle empty input', () => {
    const results = NucleiParser.parseJsonl('')
    expect(results).toHaveLength(0)
  })
})
