import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { kesExec } from '../../shared/kes-client.js'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('red_team_agent')

export const wpscanTool = new FunctionTool({
  name: 'wpscan_analyze',
  description: `Scan a WordPress site using WPScan. 
Run this ONLY after verifying the target is running WordPress (via web_tech_detect).
Enumerates vulnerable plugins, themes, users, and weak passwords.
Returns parsed findings or full output if parsing fails.`,
  parameters: z.object({
    url: z.string().describe('Target URL (e.g. http://target:80/ or https://target/)'),
    apiToken: z.string().optional().describe('Optional WPScan API token (from WPDb)'),
    plugins: z.boolean().optional().describe('Enumerate vulnerable plugins (default true)'),
    themes: z.boolean().optional().describe('Enumerate vulnerable themes (default true)'),
    users: z.boolean().optional().describe('Enumerate users (default true)'),
    passwords: z.boolean().optional().describe('Try passwords (takes longer)'),
    campaignId: z.string().optional(),
  }),
  execute: async ({ url, apiToken, plugins, themes, users, passwords, campaignId }) => {
    const start = Date.now()
    
    // Construct command
    const args = ['--url', url, '--no-banner', '--format', 'json']
    if (apiToken) args.push('--api-token', apiToken)
    
    const eTags = []
    if (plugins !== false) eTags.push('vp')
    if (themes !== false) eTags.push('vt')
    if (users !== false) eTags.push('u')
    if (eTags.length > 0) args.push('-e', eTags.join(','))
    
    if (passwords) args.push('--passwords', '/usr/share/wordlists/rockyou.txt')
    
    const cmd = `wpscan ${args.join(' ')}`
    const result = await kesExec(cmd, 300) // WPScan can take a while
    
    try {
      const parsed = JSON.parse(result.stdout)
      const res = { ...parsed, rawOutput: '' } // keep raw empty if parsed

      await logger.audit('wpscan_analyze', { url }, { success: true }, Date.now() - start, campaignId)
      return res
    } catch {
      await logger.audit('wpscan_analyze', { url }, { success: false, unparsed: true }, Date.now() - start, campaignId)
      return {
        rawOutput: result.stdout || result.stderr || 'No output. Wpscan might have failed.',
      }
    }
  },
})