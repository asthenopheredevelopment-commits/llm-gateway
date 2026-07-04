import type { BaseModelProvider } from '../providers/base.js'
import type { ChatResponse, ModelProvider, StreamChunk } from '../types/provider.js'
import { ChatRequestSchema } from '../types/provider.js'
import { CircuitBreakerRegistry } from './circuit-breaker.js'
import { createAuditEntry, formatAuditEntry } from '../types/audit.js'

export interface RouterConfig {
  defaultModel?: string
  priorityOrder?: ModelProvider[]
  costOptimization?: boolean
  latencyOptimization?: boolean
}

export class LLMRouter {
  private providers = new Map<ModelProvider, BaseModelProvider>()
  private circuitBreakers: CircuitBreakerRegistry
  private auditLog: string[] = []

  constructor(
    private config: RouterConfig = {},
  ) {
    this.circuitBreakers = new CircuitBreakerRegistry()
  }

  registerProvider(provider: BaseModelProvider): void {
    this.providers.set(provider.name as ModelProvider, provider)
  }

  private audit(
    severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
    category: 'AUTH' | 'PROMPT' | 'RESPONSE' | 'POLICY' | 'ROUTE' | 'CIRCUIT' | 'STREAM',
    action: string,
    provider: string,
    model: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ): void {
    const entry = createAuditEntry(severity, category, action as any, provider, model, message, metadata)
    this.auditLog.push(formatAuditEntry(entry))
  }

  getAuditLog(): string[] {
    return [...this.auditLog]
  }

  async route(input: unknown): Promise<ChatResponse> {
    const request = ChatRequestSchema.parse(input)
    const startTime = Date.now()

    this.audit('INFO', 'PROMPT', 'REQUEST_RECEIVED', 'gateway', request.model,
      `Routing to ${this.config.priorityOrder?.join(' > ') ?? 'first-available'}`,
      { messageCount: request.messages.length },
    )

    const providers = this.config.priorityOrder ?? Array.from(this.providers.keys())

    let lastError: Error | undefined

    for (const name of providers) {
      const provider = this.providers.get(name)
      if (!provider) {
        this.audit('WARN', 'ROUTE', 'PROVIDER_SELECTED', name, request.model, 'Provider not registered', {})
        continue
      }

      const breaker = this.circuitBreakers.getOrCreate(name)

      try {
        const response = await breaker.execute(() => provider.chat(request))
        const latency = Date.now() - startTime

        this.audit('INFO', 'ROUTE', 'PROVIDER_SELECTED', name, request.model,
          `Selected provider ${name} (${latency}ms)`,
          { latency_ms: latency, ...response.usage },
        )

        return provider.toChatResponse(request, response, latency)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))

        this.audit('WARN', 'CIRCUIT', 'FALLBACK_TRIGGERED', name, request.model,
          `Provider ${name} failed: ${lastError.message}. Trying fallback...`,
          { fallbackCount: providers.indexOf(name) + 1 },
        )
      }
    }

    this.audit('ERROR', 'ROUTE', 'PROVIDER_SELECTED', 'all', request.model,
      'All providers failed',
      { lastError: lastError?.message ?? 'unknown' },
    )

    throw lastError ?? new Error('All providers failed')
  }

  async routeStream(
    input: unknown,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    const request = ChatRequestSchema.parse(input)

    const providers = this.config.priorityOrder ?? Array.from(this.providers.keys())
    let lastError: Error | undefined

    for (const name of providers) {
      const provider = this.providers.get(name)
      if (!provider) continue

      const breaker = this.circuitBreakers.getOrCreate(name)

      try {
        this.audit('INFO', 'STREAM', 'STREAM_STARTED', name, request.model, 'Starting stream', {})

        await breaker.execute(async () => {
          await provider.chatStream(request, (chunk) => {
            onChunk(chunk)
            if (chunk.done) {
              this.audit('INFO', 'STREAM', 'STREAM_COMPLETED', name, request.model, 'Stream complete', {})
            }
          })
        })

        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.audit('WARN', 'STREAM', 'STREAM_ERROR', name, request.model,
          `Stream failed: ${lastError.message}. Trying fallback...`, {},
        )
      }
    }

    this.audit('ERROR', 'STREAM', 'STREAM_ERROR', 'all', request.model, 'All streams failed', {})
    throw lastError ?? new Error('All providers failed')
  }

  getCircuitStates() {
    return this.circuitBreakers.allStates()
  }
}
