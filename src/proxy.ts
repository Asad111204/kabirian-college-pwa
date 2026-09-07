import { NextResponse, type NextRequest } from 'next/server'

/**
 * Content Security Policy, one fresh nonce per page view.
 *
 * Every script the page runs must carry this request's nonce — Next.js reads
 * it from the header below and stamps it on its own script tags, and
 * `'strict-dynamic'` lets those scripts load the chunks they need. A script an
 * attacker managed to inject (through a bug we have not found yet) would not
 * carry the nonce and would not run. That is the whole point of a CSP: it
 * limits the damage of the mistake we did not catch.
 *
 * Styles allow inline: Tailwind's stylesheet is a file, but the toast library
 * injects a <style> tag and Radix positions menus with style attributes. An
 * inline style cannot exfiltrate data on its own, so this is the accepted
 * trade-off (ADR-157).
 *
 * The API is excluded: it returns JSON and files, not pages, and its headers
 * are set in next.config.ts. Pages that use a nonce must render per request —
 * every page in this app already does, because every one reads the session.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      /*
       * Everything except the API, Next's own static files, and the icons:
       * those are not pages and carry no scripts.
       */
      source: '/((?!api|serwist/|_next/static|_next/image|favicon.ico|icons/|brand/|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
