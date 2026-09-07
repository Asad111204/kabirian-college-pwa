import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_LIMITS, LOGIN_LIMITS, assertRateLimit, checkRateLimit, clearRateLimit } from '@/server/auth/rate-limit'
import { TooManyRequestsError } from '@/server/api/errors'

/** The in-memory limiter: a rolling window per key, and a 429 with Retry-After once spent. */
describe('checkRateLimit', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-08T10:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('allows up to the limit and refuses the next, saying how long to wait', () => {
    const key = `t:${Math.random()}`
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true)
    const refused = checkRateLimit(key, 3, 60_000)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('starts a fresh window once the old one has passed', () => {
    const key = `t:${Math.random()}`
    for (let i = 0; i < 4; i++) checkRateLimit(key, 3, 60_000)
    vi.advanceTimersByTime(60_001)
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true)
  })

  it('forgets a key when asked, so a successful sign-in costs nothing', () => {
    const key = `t:${Math.random()}`
    for (let i = 0; i < 4; i++) checkRateLimit(key, 3, 60_000)
    clearRateLimit(key)
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true)
  })
})

describe('assertRateLimit', () => {
  it('throws a 429 with the rule message once the rule is spent', () => {
    const key = `t:${Math.random()}`
    const rule = { limit: 2, windowMs: 60_000, message: 'Too many.' }
    expect(() => assertRateLimit(key, rule)).not.toThrow()
    expect(() => assertRateLimit(key, rule)).not.toThrow()
    let caught: unknown
    try {
      assertRateLimit(key, rule)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(TooManyRequestsError)
    const error = caught as TooManyRequestsError
    expect(error.status).toBe(429)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.message).toBe('Too many.')
    expect(error.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('has rules that are generous for a person and tight for a script', () => {
    expect(ACCOUNT_LIMITS.passwordChange.limit).toBe(5)
    expect(ACCOUNT_LIMITS.upload.limit).toBe(30)
    expect(ACCOUNT_LIMITS.export.limit).toBe(30)
    expect(LOGIN_LIMITS.perUsername.limit).toBe(10)
    for (const rule of Object.values(ACCOUNT_LIMITS)) expect(rule.message).toMatch(/wait/)
  })
})
