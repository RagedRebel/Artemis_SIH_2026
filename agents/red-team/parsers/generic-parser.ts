export class GenericParser {
  /**
   * Summarize plain text tool output into a structured format.
   * Falls back to this when no specialized parser is available.
   */
  static summarize(output: string, maxLines = 50): {
    summary: string
    lineCount: number
    truncated: boolean
    keyFindings: string[]
  } {
    const lines = output.split('\n').filter(l => l.trim())
    const truncated = lines.length > maxLines
    const displayed = lines.slice(0, maxLines)

    const keyPatterns = [
      /vuln/i, /critical/i, /exploit/i, /CVE-\d{4}-\d+/,
      /VULNERABLE/i, /password/i, /credential/i, /injection/i,
      /remote code/i, /unauthorized/i, /sensitive/i, /exposed/i,
    ]

    const keyFindings = lines
      .filter(line => keyPatterns.some(p => p.test(line)))
      .slice(0, 10)

    return {
      summary: displayed.join('\n'),
      lineCount: lines.length,
      truncated,
      keyFindings,
    }
  }
}
