import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('red_team_agent')

export const searchsploitTool = new FunctionTool({
  name: 'searchsploit',
  description: `Search the local ExploitDB database for public exploits and shellcode.
Returns matching exploit titles, paths, and types.

Examples:
  query: "vsftpd 2.3.4"
  query: "Apache 2.4.49"
  query: "CVE-2021-41773"
  query: "ms17-010"
  query: "SMB Windows"

Useful to find both Metasploit modules and standalone PoC scripts before exploitation.
The output will show paths like 'exploits/unix/remote/...' — cross-reference these with
msf_search to find the matching Metasploit module.`,
  parameters: z.object({
    query: z.string().describe('Search query (service name, version, CVE, etc.)'),
    exact: z.boolean().optional().describe('Use exact match (default false)'),
    json: z.boolean().optional().describe('Output as JSON for easier parsing (default true)'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ query, exact, json: jsonOutput, campaignId }) => {
    const start = Date.now()
    const useJson = jsonOutput !== false
    let command = `searchsploit ${exact ? '--exact' : ''} ${useJson ? '--json' : ''} ${query}`
    command = command.replace(/\s+/g, ' ').trim()

    const result = await kesExec(command, 30)

    let exploits: Array<{ title: string; path: string; type: string }> = []
    if (useJson && result.stdout) {
      try {
        const data = JSON.parse(result.stdout) as {
          RESULTS_EXPLOIT?: Array<{
            Title: string
            Path: string
            'Type': string
          }>
        }
        exploits = (data.RESULTS_EXPLOIT ?? []).map(e => ({
          title: e.Title,
          path: e.Path,
          type: e.Type,
        }))
      } catch {
        // JSON parse failed, return raw output
      }
    }

    await logger.audit(
      'searchsploit',
      { query },
      { count: exploits.length, output: exploits.length > 0 ? exploits : result.stdout },
      Date.now() - start,
      campaignId,
    )

    return {
      exploits,
      totalResults: exploits.length,
      rawOutput: result.stdout,
      error: result.returncode !== 0 ? result.stderr : undefined,
    }
  },
})
