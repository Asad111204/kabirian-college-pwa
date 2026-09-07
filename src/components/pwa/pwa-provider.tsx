'use client'

import { SerwistProvider } from '@serwist/turbopack/react'
import { UpdatePrompt } from './update-prompt'

/**
 * Registers the service worker and listens for updates. Wrapped around the
 * whole app in the root layout; renders nothing of its own.
 *
 * `updateViaCache: 'none'` makes the browser check the network for a new
 * worker on every visit rather than trusting its HTTP cache, so a deployment
 * reaches every phone within a page load.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" options={{ scope: '/', updateViaCache: 'none' }}>
      <UpdatePrompt />
      {children}
    </SerwistProvider>
  )
}
