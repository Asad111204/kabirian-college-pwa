/**
 * Phase 14: the audit viewer, security headers, signed-in devices and rate
 * limits through the PRODUCTION build, against the THROWAWAY database.
 * Runs after verify-notices.mjs so the audit trail has something in it.
 * Run by tests/harness/run.mjs.
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
async function login(who, username, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36') {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'user-agent': ua },
    body: JSON.stringify({ username, password: ids.password }),
    redirect: 'manual',
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie.startsWith('kc_session=')) throw new Error(`login failed for ${username}: ${res.status}`)
  jars.set(who, cookie)
}
async function call(who, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE,
      cookie: jars.get(who) ?? '',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* page or empty */
  }
  return { status: res.status, text, json, data: json?.data, error: json?.error, headers: res.headers, location: res.headers.get('location') }
}
const get = (who, path) => call(who, 'GET', path)

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student', 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/127.0.0.0 Mobile Safari/537.36')
await login('unlinked', 'harness.unlinked')

/* ========================================================================== */

heading('Security headers and the Content Security Policy')

let r = await get('nobody', '/login')
const csp = r.headers.get('content-security-policy') ?? ''
const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? ''
check('the sign-in page carries a CSP with a nonce and strict-dynamic', r.status === 200 && nonce.length > 20 && csp.includes("'strict-dynamic'"), csp.slice(0, 120))
check('scripts are not allowed inline without the nonce', !/script-src[^;]*'unsafe-inline'/.test(csp))
check('nothing may frame the app, no plugins, no foreign form targets', csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") && csp.includes("form-action 'self'"))
const scripts = [...r.text.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
const unstamped = scripts.filter((s) => !s.includes(`nonce="${nonce}"`))
check(`every script tag on the page carries this request's nonce (${scripts.length} tags)`, scripts.length > 0 && unstamped.length === 0, unstamped.slice(0, 2).join(' | ').slice(0, 200))
const r2 = await get('nobody', '/login')
const nonce2 = /'nonce-([^']+)'/.exec(r2.headers.get('content-security-policy') ?? '')?.[1] ?? ''
check('the next request gets a different nonce', nonce2 && nonce2 !== nonce)
check('X-Powered-By is gone', r.headers.get('x-powered-by') === null)
check('frame, sniffing, referrer, opener and HSTS headers are present', r.headers.get('x-frame-options') === 'DENY' && r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('referrer-policy') === 'strict-origin-when-cross-origin' && r.headers.get('cross-origin-opener-policy') === 'same-origin' && (r.headers.get('strict-transport-security') ?? '').includes('max-age='), [...r.headers.entries()].filter(([k]) => /frame|sniff|referrer|opener|strict/.test(k)).map(([k, v]) => `${k}=${v}`).join('; '))

r = await get('admin', '/admin')
const adminCsp = r.headers.get('content-security-policy') ?? ''
const adminNonce = /'nonce-([^']+)'/.exec(adminCsp)?.[1] ?? ''
const adminUnstamped = [...r.text.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((s) => !s.includes(`nonce="${adminNonce}"`))
check('a signed-in page carries the CSP and every script is stamped', r.status === 200 && adminNonce && adminUnstamped.length === 0, `${r.status} unstamped=${adminUnstamped.length}`)

r = await get('nobody', '/api/v1/health')
check('the API carries no CSP (it is not a page) and is never cached', r.headers.get('content-security-policy') === null && (r.headers.get('cache-control') ?? '').includes('no-store'), `cc=${r.headers.get('cache-control')}`)
r = await get('admin', '/api/v1/audit')
check('an authenticated API response is no-store as well', (r.headers.get('cache-control') ?? '').includes('no-store'), r.headers.get('cache-control'))

r = await get('nobody', '/there-is-nothing-here')
check('an unknown address is a 404 page with the CSP', r.status === 404 && r.text.includes('Page not found') && /'nonce-/.test(r.headers.get('content-security-policy') ?? ''), String(r.status))
check('the 404 page does not reveal what does exist', !r.text.includes('/admin/') && !r.text.includes('/api/v1/'))

/* ========================================================================== */

heading('The audit viewer')

r = await get('admin', '/api/v1/audit')
check('admin lists the audit trail, newest first', r.status === 200 && r.data.total > 0 && r.data.items.length > 0, `${r.status} total=${r.data?.total}`)
const first = r.data?.items?.[0]
check('the list is built from safe columns only: no snapshot, no metadata', r.status === 200 && !r.text.includes('beforeData') && !r.text.includes('afterData') && !r.text.includes('"metadata"') && !r.text.includes('password'))
check('each row names the actor, the sentence and the record', first && first.actor?.username && first.description && first.entityType && first.tone)
check('rows are newest first', r.data.items.length < 2 || new Date(r.data.items[0].createdAt) >= new Date(r.data.items[1].createdAt))
check('sign-ins are hidden by default', !r.data.items.some((i) => i.action.startsWith('auth.login')))
r = await get('admin', '/api/v1/audit?includeSignIns=true&module=auth')
check('…and shown when asked for', r.status === 200 && r.data.items.some((i) => i.action === 'auth.login'), `${r.status} ${r.data?.items?.map((i) => i.action).slice(0, 4)}`)
r = await get('admin', '/api/v1/audit?module=notice')
check('filters by module', r.status === 200 && r.data.total > 0 && r.data.items.every((i) => i.action.startsWith('notice.')), `${r.data?.total}`)
r = await get('admin', '/api/v1/audit?action=notice.created')
check('filters by one action', r.status === 200 && r.data.total > 0 && r.data.items.every((i) => i.action === 'notice.created'))
r = await get('admin', '/api/v1/audit?actor=harness.admin')
check('filters by who', r.status === 200 && r.data.total > 0 && r.data.items.every((i) => i.actor?.username === 'harness.admin'))
r = await get('admin', '/api/v1/audit?actor=teacher.a')
check('who is a contains-match', r.status === 200 && r.data.items.every((i) => i.actor?.username === 'harness.teacher.a'))
r = await get('admin', '/api/v1/audit?entityType=notice')
check('filters by record type', r.status === 200 && r.data.total > 0 && r.data.items.every((i) => i.entityType === 'notice'))
// The college's day, not UTC's: the log is filtered on the college calendar.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
r = await get('admin', `/api/v1/audit?dateFrom=${today}&dateTo=${today}`)
check('filters by date, on the college calendar', r.status === 200 && r.data.total > 0, `${r.data?.total}`)
r = await get('admin', '/api/v1/audit?dateFrom=2030-01-01')
check('a date range with nothing in it is empty, not an error', r.status === 200 && r.data.total === 0)
r = await get('admin', '/api/v1/audit?pageSize=5&page=2')
check('pages', r.status === 200 && r.data.page === 2 && r.data.items.length <= 5)
r = await get('admin', "/api/v1/audit?action=notice.created'%20OR%201=1")
check('an action that is not an action key → 400', r.status === 400, String(r.status))
r = await get('admin', '/api/v1/audit?dateFrom=yesterday')
check('a date that is not a date → 400', r.status === 400, String(r.status))

r = await get('admin', '/api/v1/audit/options')
check('filter options come from what was recorded', r.status === 200 && r.data.modules.some((m) => m.key === 'notice' && m.label === 'Notices') && r.data.actions.some((a) => a.key === 'notice.created') && r.data.entityTypes.includes('notice'))

r = await get('admin', '/api/v1/audit?action=notice.updated')
const updated = r.data?.items?.[0]
r = await get('admin', `/api/v1/audit/${updated?.id}`)
check('one entry shows the fields that changed, before and after', r.status === 200 && Array.isArray(r.data.changes) && r.data.changes.some((c) => c.field === 'Title' && c.before && c.after), `${r.status} ${JSON.stringify(r.data?.changes ?? r.error).slice(0, 200)}`)
check('the raw snapshot never leaves the server', !r.text.includes('beforeData') && !r.text.includes('afterData') && !/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(JSON.stringify(r.data?.changes ?? [])))
check('the entry carries the browser field (null when the route did not record one)', r.data && 'userAgent' in r.data && (r.data.userAgent === null || typeof r.data.userAgent === 'string'))
r = await get('admin', '/api/v1/audit?includeSignIns=true&action=auth.login')
const loginEntry = r.data?.items?.[0]
r = await get('admin', `/api/v1/audit/${loginEntry?.id}`)
check('a sign-in entry has no changes and does not pretend to', r.status === 200 && r.data.changes.length === 0, `${r.status}`)
r = await get('admin', '/api/v1/audit/99999999-9999-4999-8999-999999999999')
check('an entry that does not exist → 404', r.status === 404, String(r.status))
r = await get('admin', '/api/v1/audit/not-an-id')
check('an id that is not an id → 400', r.status === 400, String(r.status))

const csvRes = await fetch(`${BASE}/api/v1/audit?module=notice&format=csv`, { headers: { cookie: jars.get('admin') } })
const csvText = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await csvRes.arrayBuffer())
r = await get('admin', '/api/v1/audit?module=notice&pageSize=100')
const csvRows = csvText.split('\r\n').filter(Boolean).length - 1
check('the CSV is a download of the same rows', csvRes.status === 200 && (csvRes.headers.get('content-type') ?? '').startsWith('text/csv') && (csvRes.headers.get('content-disposition') ?? '').includes('attachment') && csvRows === r.data.total, `${csvRes.status} rows=${csvRows} total=${r.data?.total}`)
check('the CSV header is the viewer’s columns, after the byte-order mark', csvText.charCodeAt(0) === 0xfeff && csvText.slice(1).startsWith('When,Who,Name,Role,Action,Did what,Record type,Record,IP address'), JSON.stringify(csvText.slice(0, 80)))

for (const who of ['student', 'teacherA', 'unlinked']) {
  r = await get(who, '/api/v1/audit')
  const o = await get(who, '/api/v1/audit/options')
  const d = await get(who, `/api/v1/audit/${updated?.id}`)
  const c = await fetch(`${BASE}/api/v1/audit?format=csv`, { headers: { cookie: jars.get(who) } })
  check(`${who}: the audit API is 403 — list, options, entry and CSV alike`, r.status === 403 && o.status === 403 && d.status === 403 && c.status === 403, `${r.status} ${o.status} ${d.status} ${c.status}`)
}
r = await get('nobody', '/api/v1/audit')
check('signed out → 401', r.status === 401, String(r.status))

r = await get('admin', '/admin/audit?module=notice')
check('the audit page renders for the office', r.status === 200 && r.text.includes('Audit log') && r.text.includes('Download CSV') && !r.text.includes('beforeData'), String(r.status))
for (const who of ['student', 'teacherA', 'nobody']) {
  r = await get(who, '/admin/audit')
  check(`${who} is sent away from the audit page`, r.status === 307, String(r.status))
}

/* ========================================================================== */

heading('Rate limits')

let statuses = []
for (let i = 0; i < 6; i++) {
  r = await call('unlinked', 'POST', '/api/v1/auth/change-password', { currentPassword: 'not-the-password', newPassword: 'Another-Passw0rd!', confirmPassword: 'Another-Passw0rd!' })
  statuses.push(r.status)
}
check('the sixth password change in a quarter hour → 429 with Retry-After', statuses.slice(0, 5).every((s) => s !== 429) && statuses[5] === 429 && Number(r.headers.get('retry-after')) > 0, statuses.join(','))
check('the refusal is a sentence, not a stack trace', r.error?.code === 'RATE_LIMITED' && /wait/.test(r.error?.message ?? ''))

statuses = []
for (let i = 0; i < 31; i++) {
  const res = await fetch(`${BASE}/api/v1/reports/students?format=csv`, { headers: { cookie: jars.get('teacherB') } })
  statuses.push(res.status)
  await res.arrayBuffer()
}
check('the thirty-first export in ten minutes → 429, even for a caller the report refuses', statuses.slice(0, 30).every((s) => s === 403) && statuses[30] === 429, `${statuses.slice(28).join(',')}`)

statuses = []
for (let i = 0; i < 31; i++) {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'x.pdf')
  form.append('documentTypeKey', 'NOTICE_ATTACHMENT')
  const res = await fetch(`${BASE}/api/v1/notices/99999999-9999-4999-8999-999999999999/attachments`, { method: 'POST', headers: { origin: BASE, cookie: jars.get('teacherB') }, body: form })
  statuses.push(res.status)
  await res.arrayBuffer()
}
check('the thirty-first upload in ten minutes → 429', statuses.slice(0, 30).every((s) => s !== 429) && statuses[30] === 429, `${statuses.slice(28).join(',')}`)

/* ========================================================================== */

heading('Signed-in devices')

r = await get('admin', '/api/v1/me/sessions')
check('a person sees their own sessions, one of them marked current', r.status === 200 && r.data.length >= 1 && r.data.filter((s) => s.isCurrent).length === 1, `${r.status} n=${r.data?.length}`)
check('the list names the device, never the token', r.data?.[0]?.device === 'Chrome on Windows' && !r.text.includes('tokenHash') && !r.text.includes('token'), r.data?.[0]?.device)
const adminCurrent = r.data?.find((s) => s.isCurrent)?.id
r = await get('teacherA', '/api/v1/me/sessions')
const teacherCurrent = r.data?.find((s) => s.isCurrent)?.id
check('the phone shows as a phone', r.status === 200 && r.data.some((s) => s.device === 'Safari on iPhone'), r.data?.map((s) => s.device).join(','))

r = await call('teacherA', 'DELETE', `/api/v1/me/sessions/${adminCurrent}`)
check('a person cannot end somebody else’s session through /me: 404', r.status === 404, String(r.status))
r = await call('teacherA', 'DELETE', '/api/v1/me/sessions/not-an-id')
check('an id that is not an id → 400', r.status === 400, String(r.status))
r = await get('teacherA', `/api/v1/users/${ids.userAdmin}/sessions`)
check('a teacher cannot list an account’s sessions: 403', r.status === 403, String(r.status))
r = await get('student', `/api/v1/users/${ids.userStudent}/sessions`)
check('nor can a student, even their own account, through the admin route: 403', r.status === 403, String(r.status))
r = await call('teacherA', 'DELETE', `/api/v1/users/${ids.userAdmin}/sessions/${adminCurrent}`)
check('a teacher cannot end an account’s session: 403', r.status === 403, String(r.status))
r = await get('admin', '/api/v1/me/sessions')
check('…and the admin session is untouched', r.status === 200 && r.data.some((s) => s.id === adminCurrent))

r = await get('admin', `/api/v1/users/${ids.userA}/sessions`)
check('admin lists a user’s sessions, none of them "current"', r.status === 200 && r.data.length >= 1 && r.data.every((s) => !s.isCurrent), `${r.status} n=${r.data?.length}`)
r = await get('admin', `/api/v1/users/99999999-9999-4999-8999-999999999999/sessions`)
check('a user that does not exist → 404', r.status === 404, String(r.status))
r = await call('admin', 'DELETE', `/api/v1/users/${ids.userA}/sessions/${teacherCurrent}`)
check('admin ends one device of a user', r.status === 200 && r.data.revoked === true, `${r.status}`)
r = await get('teacherA', '/api/v1/me/sessions')
check('that device is signed out at once: 401', r.status === 401, String(r.status))
r = await call('admin', 'DELETE', `/api/v1/users/${ids.userA}/sessions/${teacherCurrent}`)
check('ending it again → 404', r.status === 404, String(r.status))
r = await get('admin', '/api/v1/audit?action=user.session_revoked')
check('the revocation is in the audit trail with the device named', r.status === 200 && r.data.total >= 1 && r.data.items[0].entityLabel === 'harness.teacher.a', `${r.data?.total}`)
r = await get('admin', `/api/v1/audit/${r.data?.items?.[0]?.id}`)
check('…as a fact, not a snapshot', r.status === 200 && r.data.facts.some((f) => f.field === 'Device' && f.value === 'Safari on iPhone'), JSON.stringify(r.data?.facts))

r = await get('admin', '/api/v1/me/sessions')
const before = r.data.length
await login('admin2', 'harness.admin', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Gecko/20100101 Firefox/129.0')
await login('admin3', 'harness.admin')
r = await get('admin3', '/api/v1/me/sessions')
check('two more sign-ins → two more sessions', r.status === 200 && r.data.length === before + 2, `${r.data?.length} vs ${before}+2`)
r = await call('admin3', 'POST', '/api/v1/me/sessions/sign-out-others', {})
check('"sign out all other devices" ends every other one', r.status === 200 && r.data.revoked === before + 1, `${r.status} ${JSON.stringify(r.data)} expected ${before + 1}`)
r = await get('admin', '/api/v1/me/sessions')
const r3 = await get('admin2', '/api/v1/me/sessions')
check('…and they are gone at once', r.status === 401 && r3.status === 401, `${r.status} ${r3.status}`)
r = await get('admin3', '/api/v1/me/sessions')
check('the one making the request stays signed in', r.status === 200 && r.data.length === 1)
r = await get('admin3', '/api/v1/audit?action=auth.other_sessions_revoked')
check('recorded in the audit trail', r.status === 200 && r.data.total >= 1)

r = await call('admin3', 'DELETE', `/api/v1/me/sessions/${r3.data?.[0]?.id ?? (await get('admin3', '/api/v1/me/sessions')).data[0].id}`)
check('ending one’s own current session says so and clears the cookie', r.status === 200 && r.data.wasCurrent === true && /kc_session=;|kc_session=\s*;|Max-Age=0|expires=Thu, 01 Jan 1970/i.test(r.headers.get('set-cookie') ?? ''), `${r.status} ${r.headers.get('set-cookie')}`)
r = await get('admin3', '/api/v1/me/sessions')
check('…and that browser is signed out', r.status === 401, String(r.status))

await login('admin', 'harness.admin')
for (const who of ['admin', 'teacherB', 'student']) {
  r = await get(who, '/account/devices')
  check(`${who}: the signed-in devices page renders`, r.status === 200 && r.text.includes('Signed-in devices') && r.text.includes('This device'), String(r.status))
}
r = await get('nobody', '/account/devices')
check('signed out → sent to sign in', r.status === 307 && (r.location ?? '').includes('/login'), `${r.status} ${r.location}`)
r = await get('admin', `/admin/users/${ids.userStudent}`)
check('the user page shows the account’s devices', r.status === 200 && r.text.includes('Signed-in devices') && r.text.includes('Chrome on Android'), String(r.status))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}
