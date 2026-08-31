/**
 * Application error types.
 *
 * Services throw these; the API layer turns them into HTTP responses with a
 * safe message. Internal details (SQL, stack traces) are logged on the server
 * and never sent to the browser.
 */

export type FieldErrors = Record<string, string[]>

export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: FieldErrors
  /** Extra context for the server log — never sent to the client. */
  readonly logContext?: Record<string, unknown>

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      fields?: FieldErrors
      logContext?: Record<string, unknown>
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.status = options.status ?? 500
    this.code = options.code ?? 'INTERNAL_ERROR'
    this.fields = options.fields
    this.logContext = options.logContext
  }
}

/** 400 — the request body/query failed validation. */
export class ValidationError extends AppError {
  constructor(message = 'Please check the highlighted fields.', fields?: FieldErrors) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', fields })
  }
}

/** 401 — not signed in, or the session expired. */
export class AuthenticationError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super(message, { status: 401, code: 'UNAUTHENTICATED' })
  }
}

/** 403 — signed in, but not allowed to do this. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.', logContext?: Record<string, unknown>) {
    super(message, { status: 403, code: 'FORBIDDEN', logContext })
  }
}

/** 404 — the record does not exist (or is not visible to this user). */
export class NotFoundError extends AppError {
  constructor(what = 'record') {
    super(`That ${what} could not be found.`, { status: 404, code: 'NOT_FOUND' })
  }
}

/** 409 — the request conflicts with existing data (duplicates, in-use records). */
export class ConflictError extends AppError {
  constructor(message: string, fields?: FieldErrors) {
    super(message, { status: 409, code: 'CONFLICT', fields })
  }
}

/** 502 — an external system (Google Drive, e-mail…) failed. */
export class StorageError extends AppError {
  constructor(message = 'The file storage service is not available right now.', cause?: unknown) {
    super(message, { status: 502, code: 'STORAGE_ERROR', cause })
  }
}

/** 503 — a feature exists but has not been configured yet (e.g. no Drive credentials). */
export class NotConfiguredError extends AppError {
  constructor(message: string) {
    super(message, { status: 503, code: 'NOT_CONFIGURED' })
  }
}
