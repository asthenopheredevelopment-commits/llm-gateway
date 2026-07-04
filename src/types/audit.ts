/**
 * Template literal types for SecOps audit log formats.
 * These enforce log structure at compile time — an invalid format string
 * is a compile error, not a runtime surprise.
 */

export type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

export type AuditCategory =
  | 'AUTH' | 'PROMPT' | 'RESPONSE' | 'POLICY' | 'ROUTE' | 'CIRCUIT' | 'STREAM'

export type AuditAction =
  | 'REQUEST_RECEIVED'
  | 'PROVIDER_SELECTED'
  | 'CIRCUIT_OPEN'
  | 'CIRCUIT_CLOSED'
  | 'FALLBACK_TRIGGERED'
  | 'POLICY_VIOLATION'
  | 'CONTENT_FILTERED'
  | 'STREAM_STARTED'
  | 'STREAM_COMPLETED'
  | 'STREAM_ERROR'
  | 'TOKEN_USAGE'

export type AuditLogFormat<T extends AuditCategory, A extends AuditAction> =
  `[${Severity}] [${T}] [${A}] ${string}`

export type AuditEntry = {
  timestamp: string
  severity: Severity
  category: AuditCategory
  action: AuditAction
  provider: string
  model: string
  message: string
  metadata: Record<string, unknown>
}

export function createAuditEntry(
  severity: Severity,
  category: AuditCategory,
  action: AuditAction,
  provider: string,
  model: string,
  message: string,
  metadata: Record<string, unknown> = {},
): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    severity,
    category,
    action,
    provider,
    model,
    message,
    metadata,
  }
}

export function formatAuditEntry(entry: AuditEntry): string {
  return `[${entry.severity}] [${entry.category}] [${entry.action}] ${entry.provider}/${entry.model}: ${entry.message} ${JSON.stringify(entry.metadata)}`
}
