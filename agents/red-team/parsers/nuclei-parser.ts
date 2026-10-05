export interface NucleiResult {
  templateId: string
  info: {
    name: string
    severity: string
    description?: string
    reference?: string[]
    tags?: string[]
  }
  matcherName?: string
  type: string
  host: string
  matched: string
  ip?: string
  timestamp: string
  curl?: string
  extractedResults?: string[]
}

export class NucleiParser {
  static parseJsonl(output: string): NucleiResult[] {
    const results: NucleiResult[] = []

    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('{')) continue

      try {
        const parsed = JSON.parse(trimmed)
        results.push({
          templateId: parsed['template-id'] ?? parsed.templateId ?? 'unknown',
          info: {
            name: parsed.info?.name ?? 'Unknown',
            severity: parsed.info?.severity ?? 'unknown',
            description: parsed.info?.description,
            reference: parsed.info?.reference,
            tags: parsed.info?.tags,
          },
          matcherName: parsed['matcher-name'] ?? parsed.matcherName,
          type: parsed.type ?? 'http',
          host: parsed.host ?? '',
          matched: parsed.matched ?? parsed['matched-at'] ?? '',
          ip: parsed.ip,
          timestamp: parsed.timestamp ?? new Date().toISOString(),
          curl: parsed['curl-command'] ?? parsed.curl,
          extractedResults: parsed['extracted-results'],
        })
      } catch {
        // Skip unparseable lines
      }
    }

    return results
  }
}
