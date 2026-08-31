/**
 * Environment variables, validated once at start-up.
 *
 * Why: a typo in .env should fail loudly when the app boots, not silently at
 * 11pm when a teacher submits attendance. Zod checks every value and gives a
 * readable error listing exactly what is wrong.
 *
 * This file is server-only. Never import it from a client component.
 */
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Application
  APP_URL: z.url().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().min(1).default('Asia/Karachi'),
  APP_COLLEGE_NAME: z.string().min(1).default('Kabirian College'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy .env.example to .env and fill it in')
    .refine(
      (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
      'DATABASE_URL must be a PostgreSQL connection string (postgresql://...)',
    ),

  /**
   * Maximum simultaneous database connections this server keeps open.
   * Free hosted Postgres tiers allow very few, so keep it small.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Security — 32 bytes, base64. Used to encrypt secrets stored in the database.
  APP_ENCRYPTION_KEY: z
    .string()
    .default('')
    .refine(
      (v) => v === '' || Buffer.from(v, 'base64').length === 32,
      'APP_ENCRYPTION_KEY must be 32 bytes encoded as base64',
    ),

  // Storage (Phase 6). "none" means no file storage is configured yet.
  STORAGE_PROVIDER: z.enum(['none', 'google_drive']).default('none'),
  GOOGLE_STORAGE_MODE: z.enum(['oauth', 'service_account']).default('oauth'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().default(''),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().default(''),

  // Uploads (Phase 6)
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(100).default(10),
  UPLOAD_ALLOWED_MIME: z.string().default('image/jpeg,image/png,application/pdf'),
  DOCUMENT_REPLACE_POLICY: z.enum(['trash', 'keep']).default('trash'),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Fix your .env file (start from .env.example) and restart.`,
    )
  }

  return parsed.data
}

export const env = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

/** Allowed upload MIME types as an array (Phase 6 uses this). */
export const allowedUploadMimeTypes = env.UPLOAD_ALLOWED_MIME.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
