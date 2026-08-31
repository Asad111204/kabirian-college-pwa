'use client'

/**
 * Tiny helper for calling our own API from the browser.
 *
 * It exists so every form handles errors the same way: the server replies with
 * `{ error: { code, message, fields } }`, and this turns that into a JavaScript
 * error the form can show — including per-field messages.
 */

export interface ApiFieldErrors {
  [field: string]: string[]
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: ApiFieldErrors

  constructor(message: string, status: number, code: string, fields?: ApiFieldErrors) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    // fetch only rejects when the network itself failed.
    throw new ApiError(
      'Cannot reach the server. Check your internet connection and try again.',
      0,
      'NETWORK_ERROR',
    )
  }

  if (response.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiError('The server sent an unexpected response.', response.status, 'BAD_RESPONSE')
  }

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string; fields?: ApiFieldErrors } })
      ?.error
    throw new ApiError(
      error?.message ?? 'Something went wrong.',
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.fields,
    )
  }

  return (payload as { data: T }).data
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
