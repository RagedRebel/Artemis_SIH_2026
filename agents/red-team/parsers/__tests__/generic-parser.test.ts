import { describe, it, expect } from 'vitest'
import { GenericParser } from '../generic-parser.js'

describe('GenericParser', () => {
  it('should summarize output', () => {
    const output = 'line 1\nline 2\nline 3\n'
    const result = GenericParser.summarize(output)
    expect(result.lineCount).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('should truncate long output', () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const result = GenericParser.summarize(output, 10)
    expect(result.truncated).toBe(true)
    expect(result.summary.split('\n')).toHaveLength(10)
  })

  it('should find key findings', () => {
    const output = [
      'normal line',
      'VULNERABLE: CVE-2021-41773',
      'another line',
      'SQL injection found',
      'critical vulnerability detected',
    ].join('\n')
    const result = GenericParser.summarize(output)
    expect(result.keyFindings.length).toBeGreaterThanOrEqual(3)
  })

  it('should match CVE patterns', () => {
    const output = 'Found CVE-2024-12345 on target'
    const result = GenericParser.summarize(output)
    expect(result.keyFindings).toContain('Found CVE-2024-12345 on target')
  })

  it('should handle empty input', () => {
    const result = GenericParser.summarize('')
    expect(result.lineCount).toBe(0)
    expect(result.keyFindings).toHaveLength(0)
  })
})
