import type { MetadataRoute } from 'next'
import { env } from '@/server/config/env'

/**
 * Web App Manifest — the file that lets a browser install this site as an app
 * on a phone or desktop.
 *
 * Phase 1 makes the app installable. The service worker (offline shell,
 * caching rules) is added in Phase 15, so nothing here claims offline support
 * that does not exist yet.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${env.APP_COLLEGE_NAME} Management System`,
    short_name: env.APP_COLLEGE_NAME.split(' ')[0] ?? 'Kabirian',
    description: `Student, staff and academic management system for ${env.APP_COLLEGE_NAME}.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: '#134e4a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
