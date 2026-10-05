import { FunctionTool } from '@google/adk'
import { z } from 'zod/v4'
import { createLogger } from '../../shared/logger.js'

const logger = createLogger('blue_team_agent')

export const suggestDetectionRuleTool = new FunctionTool({
  name: 'suggest_detection_rule',
  description: 'Generate a Wazuh detection rule suggestion for a specific attack pattern that was not detected by existing rules.',
  parameters: z.object({
    attackPattern: z.string().describe('Description of the attack pattern to detect'),
    mitreTechniqueId: z.string().describe('MITRE ATT&CK technique ID'),
    logPattern: z.string().describe('Regex or string pattern to match in logs'),
    severity: z.number().describe('Suggested Wazuh severity level 1-15'),
    rationale: z.string().describe('Why this rule is needed and what gap it fills'),
  }),
  execute: async ({ attackPattern, mitreTechniqueId, logPattern, severity, rationale }) => {
    const start = Date.now()
    const ruleId = 100100 + Math.floor(Math.random() * 900)

    const ruleXml = `  <rule id="${ruleId}" level="${severity}">
    <if_group>web</if_group>
    <regex>${logPattern}</regex>
    <description>${attackPattern}</description>
    <group>artemis_generated,</group>
    <mitre>
      <id>${mitreTechniqueId}</id>
    </mitre>
  </rule>`

    await logger.audit(
      'suggest_detection_rule',
      { attackPattern, mitreTechniqueId, logPattern, severity },
      { ruleId, ruleXml },
      Date.now() - start
    )

    return {
      ruleId,
      ruleXml,
      rationale,
      status: 'suggested',
      note: 'Rule must be reviewed and added to local_rules.xml by an admin before activation.',
    }
  },
})
