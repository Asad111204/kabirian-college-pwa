import type { NextConfig } from 'next'

/**
 * Security headers applied to every response.
 * A Content-Security-Policy is added in Phase 14 (security hardening) once all
 * the pages exist, so we do not silently break scripts while building features.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // These packages must stay in Node's own module system: @node-rs/argon2 is a
  // native binary and pg opens real TCP sockets — bundling them would break.
  serverExternalPackages: ['@node-rs/argon2', 'pg', '@prisma/adapter-pg'],

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
