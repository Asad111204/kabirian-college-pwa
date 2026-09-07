import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from '@/proxy'

/**
 * The Content Security Policy: a fresh nonce per request, scripts only with
 * that nonce, nothing framed, nothing posted elsewhere.
 */
function policyFor(url = 'http://localhost:3000/login'): { header: string; directives: Record<string, string>; nonce: string } {
  const response = proxy(new NextRequest(url))
  const header = response.headers.get('content-security-policy') ?? ''
  const directives = Object.fromEntries(
    header.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const [name, ...rest] = d.split(' ')
      return [name!, rest.join(' ')]
    }),
  )
  const nonce = /'nonce-([^']+)'/.exec(directives['script-src'] ?? '')?.[1] ?? ''
  return { header, directives, nonce }
}

describe('the Content Security Policy', () => {
  it('allows scripts only with this request\'s nonce, and lets those load their chunks', () => {
    const { directives, nonce } = policyFor()
    expect(nonce.length).toBeGreaterThan(20)
    expect(directives['script-src']).toContain("'strict-dynamic'")
    expect(directives['script-src']).not.toContain("'unsafe-inline'")
    expect(directives['default-src']).toBe("'self'")
  })

  it('uses a different nonce for every request', () => {
    expect(policyFor().nonce).not.toBe(policyFor().nonce)
  })

  it('refuses framing, plugins, foreign form targets and base-tag tricks', () => {
    const { directives } = policyFor()
    expect(directives['frame-ancestors']).toBe("'none'")
    expect(directives['object-src']).toBe("'none'")
    expect(directives['form-action']).toBe("'self'")
    expect(directives['base-uri']).toBe("'self'")
    expect(directives['connect-src']).toContain("'self'")
    expect(directives['img-src']).toBe("'self' blob: data:")
  })

  it('passes the nonce to the page so Next.js can stamp its own scripts', () => {
    const response = proxy(new NextRequest('http://localhost:3000/admin'))
    // NextResponse.next() forwards overridden request headers under this prefix.
    const forwarded = response.headers.get('x-middleware-request-x-nonce')
    expect(forwarded).toBeTruthy()
    expect(response.headers.get('content-security-policy')).toContain(`'nonce-${forwarded}'`)
  })

  it('does not run for the API or static files, which are not pages', () => {
    const source = config.matcher[0]!.source
    const pattern = new RegExp(`^${source.replace(/\(\(\?!/, '((?!')}$`)
    expect(pattern.test('/login')).toBe(true)
    expect(pattern.test('/admin/audit')).toBe(true)
    expect(pattern.test('/api/v1/audit')).toBe(false)
    expect(pattern.test('/_next/static/chunks/main.js')).toBe(false)
    expect(pattern.test('/manifest.webmanifest')).toBe(false)
    expect(pattern.test('/serwist/sw.js')).toBe(false) // the worker is a script, not a page
    expect(pattern.test('/~offline')).toBe(true) // the offline page is a page
  })

  it('lets the page start a same-origin service worker', () => {
    const { directives } = policyFor()
    expect(directives['worker-src']).toBe("'self'")
    expect(directives['manifest-src']).toBe("'self'")
  })
})
