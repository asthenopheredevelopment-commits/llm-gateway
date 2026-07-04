import { describe, it, expect } from 'vitest'
import { OpenAIProvider } from '../src/providers/openai.js'
import { AnthropicProvider } from '../src/providers/anthropic.js'
import { LocalProvider } from '../src/providers/local.js'

describe('Provider base interface', () => {
  it('OpenAIProvider has correct name and default URL', () => {
    const provider = new OpenAIProvider({})
    expect(provider.name).toBe('openai')
    expect(provider['baseUrl']).toBe('https://api.openai.com/v1')
  })

  it('AnthropicProvider has correct name and default URL', () => {
    const provider = new AnthropicProvider({})
    expect(provider.name).toBe('anthropic')
    expect(provider['baseUrl']).toBe('https://api.anthropic.com/v1')
  })

  it('LocalProvider has correct name and default URL', () => {
    const provider = new LocalProvider({ baseUrl: 'http://localhost:8080/v1' })
    expect(provider.name).toBe('local')
    expect(provider['baseUrl']).toBe('http://localhost:8080/v1')
  })

  it('toChatResponse builds correct ChatResponse structure', async () => {
    const provider = new OpenAIProvider({})
    const request = {
      model: 'gpt-4o',
      messages: [{ role: 'user' as const, content: 'hi' }],
      temperature: 0.7,
      stream: false,
    }
    const resp = provider.toChatResponse(request, {
      id: 'test-id',
      content: 'Hello!',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }, 100)
    expect(resp.id).toBe('test-id')
    expect(resp.provider).toBe('openai')
    expect(resp.model).toBe('gpt-4o')
    expect(resp.content).toBe('Hello!')
    expect(resp.latency_ms).toBe(100)
    expect(resp.usage.total_tokens).toBe(15)
  })
})
