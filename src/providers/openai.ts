import { z } from 'zod'
import { BaseModelProvider } from './base.js'
import type { ChatRequest, ProviderResponse, StreamChunk } from '../types/provider.js'

const OpenAIResponseSchema = z.object({
  id: z.string(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
})

export class OpenAIProvider extends BaseModelProvider {
  readonly name = 'openai'

  protected defaultBaseUrl(): string {
    return 'https://api.openai.com/v1'
  }

  async chat(request: ChatRequest): Promise<ProviderResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey ?? ''}`,
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
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`)
    }

    const data = OpenAIResponseSchema.parse(await response.json())
    const choice = data.choices[0]
    if (!choice) throw new Error('OpenAI returned no choices')

    return {
      id: data.id,
      content: choice.message.content,
      usage: data.usage,
    }
  }

  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI streaming error ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('OpenAI streaming: no response body')

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
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            onChunk({ content: '', done: true })
            return
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              onChunk({ content: delta, done: false })
            }
          } catch {
            // skip malformed JSON chunk
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
