import { z } from 'zod'

export const ModelProviderSchema = z.enum(['openai', 'anthropic', 'local'])
export type ModelProvider = z.infer<typeof ModelProviderSchema>

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().default(false),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const ChatResponseSchema = z.object({
  id: z.string(),
  provider: ModelProviderSchema,
  model: z.string(),
  content: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
  latency_ms: z.number().nonnegative(),
})

export type ChatResponse = z.infer<typeof ChatResponseSchema>

export type ProviderResponse = {
  id: string
  content: string
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface StreamChunk {
  content: string
  done: boolean
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
