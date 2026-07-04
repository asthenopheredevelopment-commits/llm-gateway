import { describe, it, expect } from 'vitest'
import { TokenCounter } from '../src/gateway/streaming.js'

describe('TokenCounter', () => {
  it('counts tokens from chunks', () => {
    const counter = new TokenCounter()
    counter.addChunk({ content: 'Hello', done: false })
    counter.addChunk({ content: ' world', done: false })
    counter.addChunk({ content: '', done: true })
    expect(counter.getFullContent()).toBe('Hello world')
    expect(counter.estimateTokens()).toBeGreaterThan(0)
  })

  it('ignores done chunks for content', () => {
    const counter = new TokenCounter()
    counter.addChunk({ content: 'Hello', done: false })
    counter.addChunk({ content: '', done: true })
    expect(counter.getFullContent()).toBe('Hello')
  })
})

describe('streamTransform', () => {
  it('transforms stream content', async () => {
    const { streamTransform } = await import('../src/gateway/streaming.js')

    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello world'))
        controller.close()
      },
    })

    const output = await streamTransform(input, (chunk) => chunk.toUpperCase())
    const reader = output.getReader()
    const result = await reader.read()
    expect(new TextDecoder().decode(result.value)).toBe('HELLO WORLD')
  })
})
