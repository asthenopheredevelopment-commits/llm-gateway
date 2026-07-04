import { LLMRouter, type RouterConfig } from './gateway/router.js'
import { CircuitBreakerRegistry } from './gateway/circuit-breaker.js'
import { OpenAIProvider } from './providers/openai.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { LocalProvider } from './providers/local.js'
import { PolicyEnforcer } from './security/policy.js'
import { scanPromptForSafety } from './security/scanner.js'
import { createAuditEntry, formatAuditEntry } from './types/audit.js'
import type { ChatResponse, StreamChunk } from './types/provider.js'

export async function createDefaultRouter(config?: RouterConfig): Promise<LLMRouter> {
  const router = new LLMRouter(config ?? {
    priorityOrder: ['openai', 'anthropic', 'local'],
    defaultModel: 'gpt-4o',
  })

  if (process.env.OPENAI_API_KEY) {
    router.registerProvider(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }))
  }
  if (process.env.ANTHROPIC_API_KEY) {
    router.registerProvider(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }))
  }
  router.registerProvider(new LocalProvider({ baseUrl: 'http://localhost:8080/v1' }))

  return router
}

export {
  LLMRouter,
  CircuitBreakerRegistry,
  OpenAIProvider,
  AnthropicProvider,
  LocalProvider,
  PolicyEnforcer,
  scanPromptForSafety,
  createAuditEntry,
  formatAuditEntry,
}

export type { ChatResponse, StreamChunk, RouterConfig }
