/**
 * In-memory rate limiting for the login endpoint.
 *
 * Purpose: stop someone trying thousands of passwords. It counts attempts per
 * IP address and per username in a short rolling window.
 *
 * Limitation (deliberate, documented): the counters live in this server's
 * memory, so they reset on restart and are not shared between multiple server
 * instances. That is fine for a single-server college deployment. Account
 * lockout (stored in the database, see auth.service.ts) is the durable
 * protection that works regardless of how many servers run. If we ever scale
 * out, this moves to Redis or the database — see DECISIONS.md ADR-036.
 */
import 'server-only'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Stops the map growing without bound on a long-running server. */
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  bucket.count += 1

  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 }
}

/** Called after a successful login so a legitimate user is not penalised. */
export function clearRateLimit(key: string): void {
  buckets.delete(key)
}

export const LOGIN_LIMITS = {
  /** Per IP address: 20 attempts in 15 minutes. */
  perIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  /** Per username: 10 attempts in 15 minutes. */
  perUsername: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** After this many consecutive failures the account locks for a while. */
  lockoutThreshold: 10,
  lockoutMinutes: 15,
} as const
