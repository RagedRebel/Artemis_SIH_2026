import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('blue_team_agent')

const WAZUH_URL = process.env.WAZUH_API_URL ?? 'https://localhost:55000'
const WAZUH_USER = process.env.WAZUH_API_USER ?? 'wazuh-wui'
const WAZUH_PASS = process.env.WAZUH_API_PASSWORD ?? ''

let authToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (authToken && Date.now() < tokenExpiry) return authToken

  const res = await fetch(`${WAZUH_URL}/security/user/authenticate`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${WAZUH_USER}:${WAZUH_PASS}`).toString('base64'),
    },
  })
  const data = await res.json() as { data?: { token?: string } }
  authToken = data.data?.token ?? null
  tokenExpiry = Date.now() + 14 * 60 * 1000
  return authToken!
}

export const triggerActiveResponseTool = new FunctionTool({
  name: 'trigger_active_response',
  description: 'Trigger a Wazuh active response action on a specific agent (block IP, disable account, etc.).',
  parameters: z.object({
    agentId: z.string().describe('Wazuh agent ID to execute the response on'),
    command: z.enum(['block-ip', 'disable-account', 'restart-wazuh']).describe('Active response command'),
    parameters: z.record(z.string(), z.string()).describe("Parameters for the command e.g. {'srcip': '10.0.0.1'}"),
  }),
  execute: async ({ agentId, command, parameters }) => {
    const start = Date.now()
    const token = await getToken()

    const res = await fetch(`${WAZUH_URL}/active-response`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command,
        arguments: Object.values(parameters),
        agents_list: [agentId],
      }),
    })
    const data = await res.json() as { message?: string }

    await logger.audit('trigger_active_response', { agentId, command, parameters }, { success: res.ok, message: data.message }, Date.now() - start)

    return { success: res.ok, message: data.message ?? '' }
  },
})
