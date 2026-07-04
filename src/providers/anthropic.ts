import { z } from 'zod'
import { BaseModelProvider } from './base.js'
import type { ChatRequest, ProviderResponse, StreamChunk } from '../types/provider.js'

const AnthropicResponseSchema = z.object({
  id: z.string(),
  content: z.array(z.object({
    text: z.string(),
  })),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
})

export class AnthropicProvider extends BaseModelProvider {
  readonly name = 'anthropic'

  protected defaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1'
  }

  async chat(request: ChatRequest): Promise<ProviderResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system')
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      max_tokens: request.max_tokens ?? 1024,
      temperature: request.temperature,
    }
    if (systemMessage) body.system = systemMessage.content

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown')
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`)
    }

    const data = AnthropicResponseSchema.parse(await response.json())
    const block = data.content[0]
    if (!block) throw new Error('Anthropic returned no content')

    return {
      id: data.id,
      content: block.text,
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    }
  }

  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    const systemMessage = request.messages.find((m) => m.role === 'system')
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      max_tokens: request.max_tokens ?? 1024,
      temperature: request.temperature,
      stream: true,
    }
    if (systemMessage) body.system = systemMessage.content

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Anthropic streaming error ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Anthropic streaming: no response body')

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
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text
              if (text) onChunk({ content: text, done: false })
            } else if (parsed.type === 'message_stop') {
              onChunk({ content: '', done: true })
              return
            }
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
