import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Security headers applied to every response.
 *
 * The Content-Security-Policy is set per request in `src/proxy.ts`, because it
 * carries a fresh nonce for every page view; everything that is the same on
 * every response lives here. HSTS is only sent in production: on
 * http://localhost it would be ignored at best and confusing at worst.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
]

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Nothing about the server's software belongs in a response header.
  poweredByHeader: false,

  // These packages must stay in Node's own module system: @node-rs/argon2 is a
  // native binary and pg opens real TCP sockets — bundling them would break.
  serverExternalPackages: ['@node-rs/argon2', 'pg', '@prisma/adapter-pg'],

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses are personal and momentary: no cache anywhere may keep them.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      // The service worker itself must never be served stale, or an update
      // could take a day to reach a phone.
      { source: '/serwist/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ]
  },
}

// Serwist bundles the service worker with esbuild at build time (ADR-021, ADR-161).
export default withSerwist(nextConfig)
