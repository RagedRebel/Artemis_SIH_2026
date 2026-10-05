import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { createLogger } from '../../shared/logger.js'
import { resolveCredentials, isWhiteBox, type CredType } from '../lib/cred-resolver.js'

const logger = createLogger('red_team_agent')

export const getCampaignCredentialsTool = new FunctionTool({
  name: 'get_campaign_credentials',
  description: `Fetch decrypted credentials for the current white-box campaign.
Returns an empty list when the campaign is in black-box mode.
Use this BEFORE attempting authenticated tools (ad_enum, auth_test, lateral SSH/WinRM) so authenticated paths are tried before brute-force.`,
  parameters: z.object({
    campaignId: z.string().describe('Campaign ID'),
    targetHost: z.string().optional().describe('Filter to a specific target host'),
    credType: z
      .enum(['ssh', 'winrm', 'http_basic', 'ad_domain', 'api_token', 'database'])
      .optional()
      .describe('Filter to a specific credential type'),
  }),
  execute: async ({ campaignId, targetHost, credType }) => {
    const start = Date.now()

    const whiteBox = await isWhiteBox(campaignId)
    if (!whiteBox) {
      await logger.audit(
        'get_campaign_credentials',
        { campaignId, targetHost, credType },
        { mode: 'black_box', count: 0 },
        Date.now() - start,
        campaignId,
      )
      return { mode: 'black_box', credentials: [] as Array<Record<string, unknown>> }
    }

    const creds = await resolveCredentials(campaignId, {
      targetHost,
      credType: credType as CredType | undefined,
    })

    const redacted = creds.map(c => ({
      id: c.id,
      targetHost: c.targetHost,
      credType: c.credType,
      username: c.username,
      secret: c.secret,
      metadata: c.metadata,
    }))

    await logger.audit(
      'get_campaign_credentials',
      { campaignId, targetHost, credType },
      { mode: 'white_box', count: redacted.length },
      Date.now() - start,
      campaignId,
    )

    return { mode: 'white_box', credentials: redacted }
  },
})
