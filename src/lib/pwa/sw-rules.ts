/**
 * The service worker's caching rules, as pure functions so they can be tested
 * without a browser. `sw.ts` calls these; nothing else decides what the
 * worker may keep.
 */

/** Hashed build output and the static images: safe to keep, never personal. */
export function isStaticAsset(pathname: string): boolean {
  return pathname.startsWith('/_next/static/') || pathname.startsWith('/icons/') || pathname.startsWith('/brand/')
}

/** Anything under the API is personal and momentary: the worker must never store it. */
export function isApiRequest(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** The precached offline page, shown when a page cannot be fetched. */
export const OFFLINE_URL = '/~offline'
