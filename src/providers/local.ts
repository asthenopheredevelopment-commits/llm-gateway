import { BaseModelProvider } from './base.js'
import type { ChatRequest, ProviderResponse, StreamChunk } from '../types/provider.js'

export class LocalProvider extends BaseModelProvider {
  readonly name = 'local'

  protected defaultBaseUrl(): string {
    return 'http://localhost:8080/v1'
  }

  async chat(request: ChatRequest): Promise<ProviderResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown')
      throw new Error(`Local provider error ${response.status}: ${errorBody}`)
    }

    const data = await response.json() as {
      id?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    const choice = data.choices?.[0]
    if (!choice?.message?.content) throw new Error('Local provider returned no content')

    return {
      id: data.id ?? `local-${Date.now()}`,
      content: choice.message.content,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
    }
  }

  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: true,
      }),
    })

    if (!response.ok) throw new Error(`Local provider streaming error ${response.status}`)

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Local provider streaming: no response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          onChunk({ content: '', done: true })
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            onChunk({ content: '', done: true })
            return
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) onChunk({ content: delta, done: false })
          } catch {
            // skip malformed
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
