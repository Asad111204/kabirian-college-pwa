/**
 * The wrapper every API route uses.
 *
 * It does four jobs so that individual routes stay short and cannot forget them:
 *   1. loads the signed-in user (401 if there is none),
 *   2. blocks cross-site requests that try to change data (CSRF defence),
 *   3. turns thrown AppErrors into proper HTTP responses,
 *   4. logs unexpected errors on the server without leaking details to the user.
 */
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { AppError, ValidationError, type FieldErrors } from './errors'
import { requireAuthContext, type AuthContext } from '../auth/context'
import { env, isProduction } from '../config/env'
import { logger } from '../logger'

export interface ApiSuccess<T> {
  data: T
}

export interface ApiFailure {
  error: { code: string; message: string; fields?: FieldErrors }
}

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status })
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Cross-site request forgery defence.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site form
 * posts. As a second layer we require that state-changing requests come from
 * our own origin.
 */
function assertSameOrigin(request: NextRequest): void {
  if (!MUTATING_METHODS.has(request.method)) return

  const origin = request.headers.get('origin')
  if (!origin) {
    // Same-origin fetch() from a browser always sends Origin for these methods.
    throw new AppError('Missing origin header.', { status: 403, code: 'FORBIDDEN' })
  }

  const allowed = new Set<string>([env.APP_URL])
  const host = request.headers.get('host')
  if (host) {
    allowed.add(`http://${host}`)
    allowed.add(`https://${host}`)
  }

  if (!allowed.has(origin)) {
    throw new AppError('This request came from an unexpected origin.', {
      status: 403,
      code: 'FORBIDDEN',
      logContext: { origin, host },
    })
  }
}

export function errorResponse(error: unknown, requestInfo?: Record<string, unknown>): NextResponse<ApiFailure> {
  if (error instanceof AppError) {
    // 4xx are normal operating conditions; only log the interesting ones.
    if (error.status >= 500) {
      logger.error(error.message, { ...requestInfo, ...error.logContext, error })
    } else if (error.status === 403) {
      logger.warn('Forbidden request', { ...requestInfo, ...error.logContext })
    }

    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
      { status: error.status },
    )
  }

  // Anything else is a bug: log it fully, tell the user nothing technical.
  logger.error('Unhandled error in API route', { ...requestInfo, error })

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction
          ? 'Something went wrong on our side. Please try again.'
          : `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      },
    },
    { status: 500 },
  )
}

type RouteContext = { params: Promise<Record<string, string>> }
type AuthedHandler<T> = (args: {
  request: NextRequest
  ctx: AuthContext
  params: Record<string, string>
}) => Promise<NextResponse<ApiSuccess<T>> | NextResponse<ApiFailure>>

/** Wraps a route handler that requires a signed-in user. */
export function withAuth<T>(handler: AuthedHandler<T>) {
  return async (request: NextRequest, routeContext?: RouteContext) => {
    const requestInfo = { method: request.method, path: new URL(request.url).pathname }
    try {
      assertSameOrigin(request)
      const ctx = await requireAuthContext()
      const params = routeContext ? await routeContext.params : {}
      return await handler({ request, ctx, params })
    } catch (error) {
      return errorResponse(error, requestInfo)
    }
  }
}

type PublicHandler<T> = (args: {
  request: NextRequest
  params: Record<string, string>
}) => Promise<NextResponse<ApiSuccess<T>> | NextResponse<ApiFailure>>

/** Wraps a route that must work while signed out (login, health). */
export function withPublic<T>(handler: PublicHandler<T>) {
  return async (request: NextRequest, routeContext?: RouteContext) => {
    const requestInfo = { method: request.method, path: new URL(request.url).pathname }
    try {
      assertSameOrigin(request)
      const params = routeContext ? await routeContext.params : {}
      return await handler({ request, params })
    } catch (error) {
      return errorResponse(error, requestInfo)
    }
  }
}

/**
 * Parses and validates a JSON body with a Zod schema.
 * The server never trusts what the browser sent, even if the form checked it.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ValidationError('The request body was not valid JSON.')
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ValidationError('Please check the highlighted fields.', zodFieldErrors(result.error))
  }
  return result.data
}

/** Turns a Zod error into `{ fieldName: ["message"] }` for the form UI. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    ;(fields[key] ??= []).push(issue.message)
  }
  return fields
}

/** Best-effort client IP, for audit entries and rate limiting. */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip')
}
