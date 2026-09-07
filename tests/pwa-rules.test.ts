import { describe, expect, it } from 'vitest'
import { OFFLINE_URL, isApiRequest, isStaticAsset } from '@/lib/pwa/sw-rules'
import { SHORTCUT_TARGETS, isShortcutTarget, shortcutPath } from '@/lib/pwa/shortcuts'
import { isIosSafari } from '@/components/pwa/install-prompt'
import manifest from '@/app/manifest'

/**
 * What the service worker may keep, and where the home-screen shortcuts go.
 * The rules are pure functions so they can be pinned without a browser.
 */
describe('what the service worker may cache', () => {
  it('keeps only hashed build files and the static images', () => {
    expect(isStaticAsset('/_next/static/chunks/main-abc123.js')).toBe(true)
    expect(isStaticAsset('/_next/static/css/app.css')).toBe(true)
    expect(isStaticAsset('/icons/icon-192.png')).toBe(true)
    expect(isStaticAsset('/brand/logo.svg')).toBe(true)
  })

  it('never treats a page, the API or a document download as a static asset', () => {
    expect(isStaticAsset('/admin/students')).toBe(false)
    expect(isStaticAsset('/api/v1/students')).toBe(false)
    expect(isStaticAsset('/api/v1/documents/abc/content')).toBe(false)
    expect(isStaticAsset('/_next/image?url=x')).toBe(false)
    expect(isStaticAsset('/serwist/sw.js')).toBe(false)
  })

  it('recognises the API by its prefix alone', () => {
    expect(isApiRequest('/api/v1/audit')).toBe(true)
    expect(isApiRequest('/api')).toBe(true)
    expect(isApiRequest('/apiary')).toBe(false)
  })

  it('names the offline page the worker falls back to', () => {
    expect(OFFLINE_URL).toBe('/~offline')
  })
})

describe('home-screen shortcuts', () => {
  it('resolve each target to the page of the signed-in role', () => {
    expect(shortcutPath('attendance', 'STAFF')).toBe('/staff/attendance')
    expect(shortcutPath('attendance', 'STUDENT')).toBe('/student/attendance')
    expect(shortcutPath('notices', 'ADMIN')).toBe('/admin/notices')
    expect(shortcutPath('results', 'STUDENT')).toBe('/student/results')
  })

  it('send a role without that screen to somewhere sensible, never to a 404', () => {
    expect(shortcutPath('timetable', 'STUDENT')).toBe('/student')
    for (const target of SHORTCUT_TARGETS) for (const role of ['ADMIN', 'STAFF', 'STUDENT'] as const) expect(shortcutPath(target, role)).toMatch(/^\/(admin|staff|student)/)
  })

  it('refuse a target that is not one', () => {
    expect(isShortcutTarget('attendance')).toBe(true)
    expect(isShortcutTarget('admin')).toBe(false)
  })

  it('are what the manifest points at, through /go', () => {
    const m = manifest()
    expect(m.shortcuts?.map((s) => s.url)).toEqual(SHORTCUT_TARGETS.map((t) => `/go/${t}`))
    expect(m.display).toBe('standalone')
    expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true)
    expect(m.id).toBe('/')
  })
})

describe('installing on iOS', () => {
  it('is by hand in Safari only; Chrome on iOS cannot install either way', () => {
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) Chrome/127.0.0.0 Mobile Safari/537.36')).toBe(false)
  })
})
