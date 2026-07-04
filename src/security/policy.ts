import { z } from 'zod'
import { scanPromptForSafety } from './scanner.js'

export const PolicyConfigSchema = z.object({
  maxPromptLength: z.number().int().positive().default(100_000),
  blockProhibitedContent: z.boolean().default(true),
  redactSecrets: z.boolean().default(true),
  allowedModels: z.array(z.string()).optional(),
  rateLimitPerMinute: z.number().int().positive().optional(),
})

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>

export interface PolicyVerdict {
  allowed: boolean
  violations: string[]
  filteredPrompt?: string
}

export class PolicyEnforcer {
  constructor(config?: Partial<PolicyConfig>) {
    this.config = PolicyConfigSchema.parse(config ?? {})
  }
  private config: PolicyConfig

  evaluatePrompt(prompt: string): PolicyVerdict {
    const violations: string[] = []

    if (prompt.length > this.config.maxPromptLength) {
      violations.push(`Prompt length ${prompt.length} exceeds max ${this.config.maxPromptLength}`)
    }

    if (this.config.blockProhibitedContent || this.config.redactSecrets) {
      const scanResult = scanPromptForSafety(prompt)
      violations.push(...scanResult.violations)

      if (!scanResult.safe) {
        return {
          allowed: false,
          violations,
          filteredPrompt: scanResult.filtered,
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      filteredPrompt: prompt,
    }
  }
}
