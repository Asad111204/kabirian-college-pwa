/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'
import { isStaticAsset } from '@/lib/pwa/sw-rules'

/**
 * The service worker. Bundled by Serwist at build time (see
 * `app/serwist/[path]/route.ts`); the browser registers it from
 * `/serwist/sw.js`.
 *
 * What it does — and, more importantly, what it does not (ADR-021, ADR-161):
 *
 *   precached      the stylesheet, the icons, the school logo and the
 *                  offline page, so the app can launch with no network
 *   cache-first    `/_next/static/**` — hashed, immutable build files, kept
 *                  for a month and capped in number
 *   network-only   everything else: every page and every `/api/**` call.
 *                  Pages carry personal data; the worker never stores one.
 *                  When a page cannot be fetched, the precached offline
 *                  page is shown instead.
 *
 * `skipWaiting` is off on purpose: a new version waits until the person
 * chooses "Reload" from the update prompt, so a form is never yanked away
 * mid-entry by a silent refresh.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && isStaticAsset(url.pathname),
      handler: new CacheFirst({
        cacheName: 'static-assets',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60, maxAgeFrom: 'last-used' })],
      }),
    },
    {
      // Pages and the API: straight to the network, nothing stored.
      matcher: () => true,
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
