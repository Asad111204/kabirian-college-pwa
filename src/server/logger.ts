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
  'bform',
  'bformnumber',
  'b_form_number',
  'drivefileid',
  'drive_file_id',
  'drivefolderid',
  'drive_folder_id',
  'encryptedrefreshtoken',
  'encrypted_refresh_token',
  'sessiontoken',
  'session_token',
])

/**
 * A national ID by its shape, whatever it is called: 13 digits with or
 * without the dashes. Catches a CNIC that arrives inside a message, an error
 * string or a field with an unexpected name.
 */
const NATIONAL_ID_PATTERN = /\b\d{5}-\d{7}-\d\b|\b\d{13}\b/g

/** Redacts sensitive values inside a string. */
export function redactText(text: string): string {
  return text.replace(NATIONAL_ID_PATTERN, '[redacted-id]')
}

/**
 * Redacts a log context: by key, then by value. Exported for its tests; the
 * logger is the only production caller.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactText(value)
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message), stack: value.stack ? redactText(value.stack) : undefined }
  }
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactForLog(val, depth + 1)
    }
    return out
  }
  return value
}

const redact = redactForLog

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return

  const entry = {
    time: new Date().toISOString(),
    level,
    message: redactText(message),
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
