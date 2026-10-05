import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('red_team_agent')

const SYSTEM_PROMPT = `You are a senior offensive security architect. Given recon data, an existing finding list, and any captured credentials or footholds for a SINGLE engagement, output a ranked list of multi-step attack chains a human red-teamer would actually try next.

Focus on chains a signature scanner would NEVER find:
- Identity-pivot chains (kerberoast → crack → SSO → cloud IAM)
- Trust-boundary chains (header trust → SSRF → IMDS → cloud RCE)
- Lateral movement using harvested creds
- Container/cloud-aware exploitation
- Logic flaws spanning multiple services

Each chain MUST be:
- 2-6 steps long, in execution order
- Use ONLY the actual hosts, services, and creds the inputs describe — no invented hosts
- Map each step to a concrete tool from the agent toolbox: nmap_scan, web_tech_detect, nuclei_scan, lfi_test, ssrf_test, ad_enum, kerberoast, asreproast, pass_the_hash, jwt_attack, oauth_probe, sso_confusion, session_test, imds_probe, k8s_probe, container_escape_recon, cloud_meta_enum, param_fuzz, header_fuzz, api_schema_fuzz, run_exploit, cred_harvest, privesc_enum

Output ONLY valid JSON of shape: { "chains": [ { "name": "...", "rationale": "...", "estimatedImpact": "low|medium|high|critical", "steps": [ { "tool": "tool_name", "target": "host:port or scope", "args": "concise param description", "expectedSignal": "what success looks like" } ] } ] }
No prose outside the JSON.`

export const synthesizeAttackChainTool = new FunctionTool({
  name: 'synthesize_attack_chain',
  description: `Use a fresh LLM call to synthesize multi-step attack chains from your current recon + findings + credentials. Returns a ranked list of executable next-step chains. Call this AFTER recon and at least one round of scanning, especially against zero-trust / hardened targets where signature scanners find little.`,
  parameters: z.object({
    campaignId: z.string(),
    recon: z.record(z.string(), z.unknown()).describe('Recon JSON: hosts, ports, services, technologies'),
    findings: z.array(z.record(z.string(), z.unknown())).describe('Current findings list (title, host, severity, evidence summary)'),
    credentials: z.array(z.record(z.string(), z.unknown())).optional().describe('Captured creds, tokens, or footholds (without raw secrets)'),
    extraContext: z.string().optional().describe('Anything else worth telling the planner — environmental hints, target type'),
  }),
  execute: async ({ campaignId, recon, findings, credentials, extraContext }) => {
    const start = Date.now()
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
    if (!apiKey) {
      return {
        chains: [],
        error: 'GOOGLE_API_KEY / GEMINI_API_KEY not set; attack-chain synthesis unavailable',
      }
    }

    const userInput = JSON.stringify(
      {
        recon,
        findings,
        credentials: credentials ?? [],
        extraContext: extraContext ?? '',
      },
      null,
      2,
    )

    const client = new GoogleGenAI({ apiKey })
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro'

    let chains: unknown = []
    let raw = ''
    try {
      const resp = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userInput }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      })
      raw = resp.text ?? ''
      const parsed = JSON.parse(raw) as { chains?: unknown }
      chains = parsed.chains ?? []
    } catch (err) {
      await logger.audit('synthesize_attack_chain', { campaignId }, { error: String(err) }, Date.now() - start, campaignId)
      return { chains: [], error: `synthesis failed: ${String(err)}`, raw: raw.slice(0, 500) }
    }

    await logger.audit('synthesize_attack_chain', { campaignId, findingsCount: findings.length }, { chainCount: Array.isArray(chains) ? chains.length : 0 }, Date.now() - start, campaignId)
    return { chains, hint: 'Execute the highest-impact chain first. After each step, observe the actual signal and re-plan if needed.' }
  },
})
