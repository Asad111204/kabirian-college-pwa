import type { MetadataRoute } from 'next'
import { env } from '@/server/config/env'

/**
 * Web App Manifest — the file that lets a browser install this site as an app
 * on a phone or desktop.
 *
 * Phase 1 made the app installable; Phase 15 added the service worker
 * (offline page, cached build files — never data) and the home-screen
 * shortcuts, which go through `/go/*` so one shortcut serves every role.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${env.APP_COLLEGE_NAME} Management System`,
    short_name: env.APP_COLLEGE_NAME.split(' ')[0] ?? 'Kabirian',
    description: `Student, staff and academic management system for ${env.APP_COLLEGE_NAME}.`,
    lang: 'en',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: '#134e4a',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Attendance', url: '/go/attendance', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Timetable', url: '/go/timetable', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Notices', url: '/go/notices', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Results', url: '/go/results', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
