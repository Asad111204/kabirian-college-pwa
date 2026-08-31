/**
 * Minimal structured logger (server-side only).
 *
 * Writes one JSON object per line, which is what hosting platforms expect and
 * what log search tools can parse. It deliberately has no dependencies: adding
 * pino or similar is a drop-in replacement later if we need file transports or
 * log shipping (see DECISIONS.md ADR-034).
 *
 * IMPORTANT: it redacts anything that looks like a secret or personal ID before
 * writing, so passwords, tokens and CNIC numbers never reach the log files.
 */
import { env } from './config/env'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL = LEVEL_ORDER[env.LOG_LEVEL]

/** Field names whose values must never be logged. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'tokenhash',
  'token_hash',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'clientsecret',
  'apikey',
  'cnic',
  'cnicnumber',
  'cnic_number',
  'cnicbformnumber',
  'cnic_bform_number',
  'fathercnic',
  'father_cnic',
])

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value === null || value === undefined) return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1)
    }
    return out
  }
  return value
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  }

  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
}
