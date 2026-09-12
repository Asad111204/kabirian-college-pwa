import { createSerwistRoute } from '@serwist/turbopack'

/**
 * Serves the bundled service worker at `/serwist/sw.js`.
 *
 * Serwist bundles `app/sw.ts` with esbuild at build time and injects the
 * precache manifest: the stylesheet, the icons and the college logo from the
 * build, plus the offline page. JavaScript chunks are not precached — the
 * worker caches them as they are used, so installing the app does not pull
 * every page's code over a phone's data (ADR-161).
 *
 * The offline page's revision changes with every deployment so that a new
 * build always replaces the cached copy.
 */
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_ID ?? crypto.randomUUID()

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  // Turbopack writes the stylesheet under static/chunks; the pattern covers
  // either layout so a Next upgrade cannot silently drop it from the precache.
  globPatterns: ['.next/static/**/*.css', 'public/icons/**/*', 'public/brand/**/*'],
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
})
