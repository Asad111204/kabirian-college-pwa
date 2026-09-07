/**
 * Phase 15: the service worker, the offline page, the manifest and the
 * home-screen shortcuts through the PRODUCTION build. Run by tests/harness/run.mjs.
 */
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))

let pass = 0
let fail = 0
const failures = []
const check = (label, ok, detail = '') => {
  if (ok) {
    pass += 1
    console.log(`  ok   ${label}`)
  } else {
    fail += 1
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`)
  }
}
const heading = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`)

const jars = new Map()
async function login(who, username) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ username, password: ids.password }),
    redirect: 'manual',
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie.startsWith('kc_session=')) throw new Error(`login failed for ${username}: ${res.status}`)
  jars.set(who, cookie)
}
async function get(who, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: jars.get(who) ?? '' }, redirect: 'manual' })
  const text = await res.text()
  return { status: res.status, text, headers: res.headers, location: res.headers.get('location') }
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('student', 'harness.student')

heading('The service worker')

let r = await get('nobody', '/serwist/sw.js')
check('is served as JavaScript', r.status === 200 && /javascript/.test(r.headers.get('content-type') ?? ''), `${r.status} ${r.headers.get('content-type')}`)
check('may control the whole site from /serwist/', r.headers.get('service-worker-allowed') === '/')
check('is never served stale', /no-store|no-cache/.test(r.headers.get('cache-control') ?? ''), r.headers.get('cache-control'))
check('carries no page policy (it is a script, not a page)', r.headers.get('content-security-policy') === null)
check('precaches the offline page, the stylesheet and the icons', r.text.includes('/~offline') && /\/_next\/static\/[^"']+\.css/.test(r.text) && r.text.includes('/icons/icon-192.png'), `${r.text.length} bytes; css=${/\/_next\/static\/[^"']+\.css/.test(r.text)}`)
check('does not precache JavaScript chunks (they are cached as used)', !/\/_next\/static\/chunks\/[^"']+\.js/.test(r.text))
check('names its one runtime cache and takes its precache list from the build', r.text.includes('cacheName:"static-assets"') && r.text.includes('precacheEntries:') && /revision:"[0-9a-f]{32}"/.test(r.text))
check('waits for the person to reload (no skipWaiting on install)', !/skipWaiting:\s*!0|skipWaiting:\s*true/.test(r.text))

heading('The offline page')

r = await get('nobody', '/~offline')
check('renders with no session, says what is happening and offers to retry', r.status === 200 && r.text.includes('You are offline') && r.text.includes('Try again'), String(r.status))
check('carries the Content Security Policy like any page', /'nonce-/.test(r.headers.get('content-security-policy') ?? ''))
check('shows no data and no navigation', !r.text.includes('/admin/') && !r.text.includes('Sign out'))

heading('The manifest and the icons')

r = await get('nobody', '/manifest.webmanifest')
let m = null
try {
  m = JSON.parse(r.text)
} catch {
  /* not json */
}
check('the manifest is valid JSON with standalone display and an id', r.status === 200 && m && m.display === 'standalone' && m.id === '/', String(r.status))
check('it has a maskable icon and the 192/512 icons', m && m.icons.some((i) => i.purpose === 'maskable') && m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'))
check('its shortcuts go through /go so one shortcut serves every role', m && m.shortcuts.length === 4 && m.shortcuts.every((s) => s.url.startsWith('/go/')))
for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']) {
  const res = await fetch(`${BASE}${icon}`)
  await res.arrayBuffer()
  check(`${icon} exists as a PNG`, res.status === 200 && res.headers.get('content-type') === 'image/png', `${res.status}`)
}
r = await get('nobody', '/login')
check('the page links the manifest and the iOS icon, and declares itself web-app capable', r.text.includes('rel="manifest"') && r.text.includes('apple-touch-icon') && r.text.includes('mobile-web-app-capable'))
check('the offline banner is not rendered on the server (online is assumed until the browser says otherwise)', !r.text.includes('You are offline'))

heading('Home-screen shortcuts')

r = await get('nobody', '/go/attendance')
check('signed out → sign in', r.status === 307 && (r.location ?? '').endsWith('/login'), `${r.status} ${r.location}`)
r = await get('student', '/go/attendance')
check('a student → their attendance', r.status === 307 && (r.location ?? '').endsWith('/student/attendance'), `${r.status} ${r.location}`)
r = await get('teacherA', '/go/attendance')
check('a teacher → the register', r.status === 307 && (r.location ?? '').endsWith('/staff/attendance'), `${r.status} ${r.location}`)
r = await get('admin', '/go/notices')
check('the office → notices', r.status === 307 && (r.location ?? '').endsWith('/admin/notices'), `${r.status} ${r.location}`)
r = await get('student', '/go/timetable')
check('a screen a role does not have → that role’s dashboard', r.status === 307 && (r.location ?? '').endsWith('/student'), `${r.status} ${r.location}`)
r = await get('admin', '/go/anything-else')
check('a shortcut that is not one → 404', r.status === 404, String(r.status))

heading('Nothing personal is cached by the app')

r = await get('admin', '/api/v1/me/sessions')
check('the API still answers no-store', (r.headers.get('cache-control') ?? '').includes('no-store'))
r = await get('admin', '/admin')
check('a portal page carries the CSP and every script is stamped', r.status === 200 && /'nonce-/.test(r.headers.get('content-security-policy') ?? ''), String(r.status))
{
  // The registration URL lives in a client chunk the page loads, not in the HTML itself.
  const chunkUrls = [...r.text.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1])
  let found = false
  for (const u of chunkUrls) {
    const c = await fetch(`${BASE}${u}`)
    const t = await c.text()
    if (t.includes('swUrl:"/serwist/sw.js"') || t.includes('"/serwist/sw.js"')) found = true
  }
  check(`the portal page's scripts register the worker from /serwist/sw.js (${chunkUrls.length} chunks scanned)`, found)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}
