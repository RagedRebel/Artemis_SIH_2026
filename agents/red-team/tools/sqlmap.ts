import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { GenericParser } from '../parsers/generic-parser.js'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('red_team_agent')

export const sqlmapScanTool = new FunctionTool({
  name: 'sqlmap_scan',
  description: 'Run SQLMap to detect and exploit SQL injection vulnerabilities.',
  parameters: z.object({
    url: z.string().describe('Target URL with injection point e.g. "http://target/page?id=1"'),
    level: z.number().optional().describe('Test level 1-5 (default 1)'),
    risk: z.number().optional().describe('Risk level 1-3 (default 1)'),
    technique: z.string().optional().describe("SQLi techniques to test e.g. 'BEUSTQ'"),
    extraFlags: z.string().optional().describe('Additional sqlmap flags'),
    campaignId: z.string().optional().describe('Campaign UUID from your task prompt. Copy it exactly — never invent one.'),
  }),
  execute: async ({ url, level, risk, technique, extraFlags, campaignId }) => {
    const start = Date.now()
    let command = `sqlmap -u "${url}" --batch --random-agent`

    if (level) command += ` --level=${level}`
    if (risk) command += ` --risk=${risk}`
    if (technique) command += ` --technique=${technique}`
    if (extraFlags) command += ` ${extraFlags}`

    const result = await kesExec(command, 300)
    const parsed = GenericParser.summarize(result.stdout)

    const injectable = result.stdout.includes('is vulnerable') || result.stdout.includes('injectable')

    await logger.audit('sqlmap_scan', { url, level, risk }, { injectable }, Date.now() - start, campaignId)

    return {
      injectable,
      ...parsed,
      rawOutput: result.stdout,
      error: result.returncode !== 0 ? result.stderr : undefined,
    }
  },
})
