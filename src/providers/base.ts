import type { ChatRequest, ChatResponse, ProviderResponse, StreamChunk } from '../types/provider.js'

export abstract class BaseModelProvider {
  abstract readonly name: string
  protected apiKey: string | undefined
  protected baseUrl: string

  constructor(config: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? this.defaultBaseUrl()
  }

  protected abstract defaultBaseUrl(): string

  abstract chat(request: ChatRequest): Promise<ProviderResponse>

  abstract chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void>

  toChatResponse(request: ChatRequest, providerResponse: ProviderResponse, latencyMs: number): ChatResponse {
    return {
      id: providerResponse.id,
      provider: this.name as ChatResponse['provider'],
      model: request.model,
      content: providerResponse.content,
      usage: providerResponse.usage,
      latency_ms: latencyMs,
    }
  }
}
