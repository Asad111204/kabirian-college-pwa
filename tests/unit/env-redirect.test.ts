import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Google callback follows APP_URL unless it is set explicitly, so the
 * deployed site and a laptop each get the right one from a single variable.
 */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules()
  const previous = { ...process.env }
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://localhost:5432/nova_school_test',
    APP_TIMEZONE: 'Asia/Karachi',
    APP_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    ...vars,
  })
  for (const [key, value] of Object.entries(vars)) if (value === undefined) delete process.env[key]
  try {
    const { env } = await import('@/server/config/env')
    return env
  } finally {
    process.env = previous
  }
}

afterEach(() => {
  vi.resetModules()
})

describe('the Google callback URL', () => {
  it('follows APP_URL when it is not set', async () => {
    const env = await loadEnv({ APP_URL: 'https://nova-school-kamalia.example.com', GOOGLE_OAUTH_REDIRECT_URI: undefined })
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBe('https://nova-school-kamalia.example.com/api/v1/settings/google/callback')
  })

  it('does not double the slash when APP_URL ends in one', async () => {
    const env = await loadEnv({ APP_URL: 'https://nova-school-kamalia.example.com/', GOOGLE_OAUTH_REDIRECT_URI: '' })
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBe('https://nova-school-kamalia.example.com/api/v1/settings/google/callback')
  })

  it('gives a laptop the localhost callback', async () => {
    const env = await loadEnv({ APP_URL: 'http://localhost:3000', GOOGLE_OAUTH_REDIRECT_URI: '' })
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBe('http://localhost:3000/api/v1/settings/google/callback')
  })

  it('never overrides one that was set explicitly', async () => {
    const env = await loadEnv({ APP_URL: 'https://nova-school-kamalia.example.com', GOOGLE_OAUTH_REDIRECT_URI: 'https://college.example.com/api/v1/settings/google/callback' })
    expect(env.GOOGLE_OAUTH_REDIRECT_URI).toBe('https://college.example.com/api/v1/settings/google/callback')
  })
})
