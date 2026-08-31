import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { env } from '@/server/config/env'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: `${env.APP_COLLEGE_NAME} — Management System`,
    template: `%s · ${env.APP_COLLEGE_NAME}`,
  },
  description: `Student, staff and academic management system for ${env.APP_COLLEGE_NAME}.`,
  applicationName: env.APP_COLLEGE_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: env.APP_COLLEGE_NAME,
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false }, // a private college system — keep it out of search engines
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#134e4a' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
