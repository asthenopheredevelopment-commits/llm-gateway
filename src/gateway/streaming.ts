import type { StreamChunk } from '../types/provider.js'

export class TokenCounter {
  private chunks: string[] = []

  addChunk(chunk: StreamChunk): void {
    if (!chunk.done && chunk.content) {
      this.chunks.push(chunk.content)
    }
  }

  getFullContent(): string {
    return this.chunks.join('')
  }

  estimateTokens(): number {
    const text = this.getFullContent()
    return Math.ceil(text.length / 4)
  }
}

export async function streamTransform(
  input: ReadableStream<Uint8Array>,
  transform: (chunk: string) => string,
): Promise<ReadableStream<Uint8Array>> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }
          const text = decoder.decode(value, { stream: true })
          const transformed = transform(text)
          controller.enqueue(encoder.encode(transformed))
        }
      } finally {
        reader.releaseLock()
      }
    },
  })
}

export function createSecurityTransformStream(
  scanner: (text: string) => { safe: boolean; filtered?: string },
): TransformStream<string, string> {
  return new TransformStream({
    transform(chunk, controller) {
      const result = scanner(chunk)
      if (result.safe) {
        controller.enqueue(chunk)
      } else if (result.filtered) {
        controller.enqueue(result.filtered)
      }
    },
    flush(controller) {
      controller.terminate()
    },
  })
}

export function createTokenValidationStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true })
      const words = text.split(/\s+/)
      if (words.length > 10_000) {
        controller.error(new Error('Token limit exceeded'))
        return
      }
      controller.enqueue(encoder.encode(text))
    },
    flush(controller) {
      controller.terminate()
    },
  })
}
