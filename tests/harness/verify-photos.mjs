/**
 * Phase 19: profile photos. A real image upload (the harness runs the
 * in-memory storage provider), the thumbnail served to the right people and
 * refused to the wrong ones, the photo id on the lists, and the picture gone
 * when the document is deleted. Through the PRODUCTION build.
 * Run by tests/harness/run.mjs.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))

let pass = 0
let fail = 0
const failures = []
const check = (label, ok, detail = '') => {
  if (ok) pass += 1
  else {
    fail += 1
    failures.push(label)
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`)
}

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
async function call(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { origin: BASE, cookie: jars.get(who) ?? '', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* page */
  }
  return { status: res.status, text, data: json?.data, error: json?.error, headers: res.headers }
}
const get = (who, path) => call(who, 'GET', path)
async function photo(who, path, extra = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: jars.get(who) ?? '', ...extra }, redirect: 'manual' })
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, bytes: buf, type: res.headers.get('content-type'), etag: res.headers.get('etag'), cache: res.headers.get('cache-control') }
}

// A genuine 300×400 PNG, made by sharp -- the same library the server uses --
// so the upload passes the magic-byte check and the thumbnail can be made.
const require = createRequire(join(ROOT, 'package.json'))
const sharp = require('sharp')
const PNG = await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 200, g: 120, b: 90 } } }).png().toBuffer()
async function uploadImage(who, path, typeKey) {
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'photo.png')
  form.append('documentTypeKey', typeKey)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, cookie: jars.get(who) ?? '' }, body: form, redirect: 'manual' })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* empty */
  }
  return { status: res.status, data: json?.data, error: json?.error, text }
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student')
await login('unlinked', 'harness.unlinked')

console.log('\nA student’s photograph\n' + '-'.repeat(52))
let r = await get('admin', '/api/v1/students?pageSize=5&search=Ali%20Raza')
check('before any upload the list says the student has no photo', r.status === 200 && r.data.items[0]?.photoId === null, JSON.stringify(r.data?.items?.[0]?.photoId))
let p = await photo('admin', `/api/v1/students/${ids.student}/photo`)
check('…and the photo endpoint is 404', p.status === 404, String(p.status))

r = await uploadImage('admin', `/api/v1/students/${ids.student}/documents`, 'STUDENT_PHOTO')
check('the office uploads a real PNG as the student photo → 201', r.status === 201, `${r.status} ${r.text.slice(0, 160)}`)
const photoDocId = r.data?.id
r = await get('admin', '/api/v1/students?pageSize=5&search=Ali%20Raza')
check('the list now carries the photo id', r.status === 200 && r.data.items[0]?.photoId === photoDocId, JSON.stringify(r.data?.items?.[0]?.photoId))

p = await photo('admin', `/api/v1/students/${ids.student}/photo?v=${photoDocId}`)
check('the office gets a JPEG thumbnail, privately cacheable, with an ETag', p.status === 200 && p.type === 'image/jpeg' && p.bytes[0] === 0xff && p.bytes[1] === 0xd8 && /private/.test(p.cache ?? '') && Boolean(p.etag), `${p.status} ${p.type} ${p.cache}`)
check('it is small: a thumbnail, not the upload', p.bytes.byteLength > 100 && p.bytes.byteLength < 20_000, `${p.bytes.byteLength} bytes`)
const etag = p.etag
p = await photo('admin', `/api/v1/students/${ids.student}/photo?v=${photoDocId}`, { 'if-none-match': etag })
check('a browser that has it gets 304', p.status === 304, String(p.status))
p = await photo('student', `/api/v1/students/${ids.student}/photo`)
check('the student sees their own photo', p.status === 200, String(p.status))
p = await photo('teacherA', `/api/v1/students/${ids.student}/photo`)
check('a teacher of their section sees it', p.status === 200, String(p.status))
p = await photo('teacherB', `/api/v1/students/${ids.student}/photo`)
check('a teacher of another section does not: 403', p.status === 403, String(p.status))
p = await photo('unlinked', `/api/v1/students/${ids.student}/photo`)
check('an unlinked staff login does not: 403', p.status === 403, String(p.status))
p = await photo('nobody', `/api/v1/students/${ids.student}/photo`)
check('signed out: 401', p.status === 401, String(p.status))

r = await get('teacherA', `/api/v1/staff-portal/students?pageSize=5`)
check('the teacher’s student list carries the photo id too', r.status === 200 && (r.data.items ?? []).some((s) => s.photoId === photoDocId), `${r.status} ${JSON.stringify((r.data?.items ?? []).map((s) => s.photoId))}`)
r = await get('admin', `/admin/students/${ids.student}`)
check('the student page shows the photograph', r.status === 200 && r.text.includes(`/api/v1/students/${ids.student}/photo?v=${photoDocId}`), String(r.status))
r = await get('admin', '/admin/students?search=Ali')
check('…and so does the list', r.status === 200 && r.text.includes(`/api/v1/students/${ids.student}/photo`), String(r.status))

console.log('\nA staff member’s photograph\n' + '-'.repeat(52))
r = await uploadImage('teacherA', `/api/v1/staff/${ids.staffA}/documents`, 'STAFF_PHOTO')
const staffUpload = r.status
r = staffUpload === 201 ? r : await uploadImage('admin', `/api/v1/staff/${ids.staffA}/documents`, 'STAFF_PHOTO')
check('a staff photo is uploaded (by the person or the office)', r.status === 201, `${staffUpload}/${r.status} ${r.text.slice(0, 120)}`)
const staffPhotoId = r.data?.id
p = await photo('teacherA', `/api/v1/staff/${ids.staffA}/photo`)
check('the staff member sees their own photo', p.status === 200 && p.type === 'image/jpeg', String(p.status))
p = await photo('admin', `/api/v1/staff/${ids.staffA}/photo`)
check('the office sees it', p.status === 200, String(p.status))
p = await photo('teacherB', `/api/v1/staff/${ids.staffA}/photo`)
check('a colleague does not: 403', p.status === 403, String(p.status))
p = await photo('student', `/api/v1/staff/${ids.staffA}/photo`)
check('a student does not: 403', p.status === 403, String(p.status))
r = await get('teacherA', '/staff')
check('the staff member’s own portal shows their photo in the menu', r.status === 200 && r.text.includes(`/api/v1/staff/${ids.staffA}/photo?v=${staffPhotoId}`), String(r.status))
r = await get('admin', '/api/v1/staff?pageSize=10')
check('the staff list carries the photo id', r.status === 200 && r.data.items.some((s) => s.id === ids.staffA && s.photoId === staffPhotoId))

console.log('\nReplacing and deleting\n' + '-'.repeat(52))
r = await uploadImage('admin', `/api/v1/students/${ids.student}/documents`, 'STUDENT_PHOTO')
check('a second upload replaces the photo → 201 with a new id', r.status === 201 && r.data.id !== photoDocId, `${r.status}`)
const secondId = r.data?.id
p = await photo('admin', `/api/v1/students/${ids.student}/photo?v=${secondId}`)
check('the new thumbnail is served with a new ETag', p.status === 200 && p.etag !== etag, `${p.status} ${p.etag}`)
r = await call('admin', 'DELETE', `/api/v1/documents/${secondId}`)
check('the office deletes the photo document', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
p = await photo('admin', `/api/v1/students/${ids.student}/photo`)
check('…and the photo is gone: 404', p.status === 404, String(p.status))
r = await get('admin', '/api/v1/students?pageSize=5&search=Ali%20Raza')
check('…and the list says so', r.status === 200 && r.data.items[0]?.photoId === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}
