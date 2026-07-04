/**
 * Security scanner for LLM prompts and responses.
 * Detects leaked credentials, PII, and policy violations
 * without blocking the streaming path.
 */

const API_KEY_PATTERNS = [
  /\b[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  /\bghp_[A-Za-z0-9]{36}\b/g,
  /\bgho_[A-Za-z0-9]{36}\b/g,
  /\bghu_[A-Za-z0-9]{36}\b/g,
  /\bghs_[A-Za-z0-9]{36}\b/g,
  /\bghr_[A-Za-z0-9]{36}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
]

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{16}\d*\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
]

const PROHIBITED_CONTENT_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|above|prior)\s+instructions\b/i,
  /\bforget\s+(all\s+)?(previous|above|prior)\b/i,
  /\bdisregard\s+(all\s+)?(previous|above|prior)\b/i,
  /\bYou\s+are\s+(now|not)\s+(GPT|Claude|AI|assistant)\b/i,
]

export interface ScanResult {
  safe: boolean
  hasSecrets: boolean
  hasPII: boolean
  hasProhibitedContent: boolean
  matches: Array<{ type: 'api_key' | 'pii' | 'prohibited'; value: string }>
}

export function scanText(text: string): ScanResult {
  if (typeof text !== 'string') {
    return { safe: true, hasSecrets: false, hasPII: false, hasProhibitedContent: false, matches: [] }
  }
  const normalized = text.normalize('NFKC')
  const matches: ScanResult['matches'] = []

  for (const pattern of API_KEY_PATTERNS) {
    const found = normalized.match(pattern)
    if (found) {
      for (const value of found) {
        if (value.length >= 20 && !isCommonWord(value)) {
          matches.push({ type: 'api_key', value: maskValue(value) })
        }
      }
    }
  }

  for (const pattern of PII_PATTERNS) {
    const found = normalized.match(pattern)
    if (found) {
      for (const value of found) {
        matches.push({ type: 'pii', value: maskValue(value) })
      }
    }
  }

  for (const pattern of PROHIBITED_CONTENT_PATTERNS) {
    const found = normalized.match(pattern)
    if (found) {
      for (const value of found) {
        matches.push({ type: 'prohibited', value })
      }
    }
  }

  return {
    safe: matches.length === 0,
    hasSecrets: matches.some((m) => m.type === 'api_key'),
    hasPII: matches.some((m) => m.type === 'pii'),
    hasProhibitedContent: matches.some((m) => m.type === 'prohibited'),
    matches,
  }
}

export function scanPromptForSafety(text: string): { safe: boolean; filtered: string; violations: string[] } {
  const normalized = text.normalize('NFKC')
  const result = scanText(normalized)
  if (result.safe) return { safe: true, filtered: text, violations: [] }

  let filtered = normalized
  const violations: string[] = []

  for (const pattern of API_KEY_PATTERNS) {
    filtered = filtered.replace(pattern, '[REDACTED]')
  }
  if (result.hasSecrets) violations.push('API key detected and redacted')

  for (const pattern of PII_PATTERNS) {
    filtered = filtered.replace(pattern, '[REDACTED]')
  }
  if (result.hasPII) violations.push('PII detected and redacted')

  for (const pattern of PROHIBITED_CONTENT_PATTERNS) {
    filtered = filtered.replace(pattern, '[FILTERED]')
  }
  if (result.hasProhibitedContent) violations.push('Prohibited content pattern detected')

  return { safe: false, filtered, violations }
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****'
  return value.slice(0, 4) + '****' + value.slice(-4)
}

const COMMON_WORDS = new Set([
  'aaaaaaaaaaaaaaaaaaaa', 'xxxxxxxxxxxxxxxxxxxx',
  'testtesttesttesttest', 'qwertyuiopasdfghjklz',
  '01234567890123456789',
])

function isCommonWord(value: string): boolean {
  const lower = value.toLowerCase()
  if (COMMON_WORDS.has(lower)) return true
  return /^([a-zA-Z])\1{19,}$/.test(value)
}
