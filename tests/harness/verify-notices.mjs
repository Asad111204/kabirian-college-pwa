/**
 * Phase 11 step 2: notices and events through the PRODUCTION build, against
 * the THROWAWAY database. Run by tests/harness/run.mjs.
 */
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const fx = JSON.parse(readFileSync(new URL('./ids-notices.json', import.meta.url), 'utf8'))

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
async function call(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE,
      cookie: jars.get(who) ?? '',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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
  return { status: res.status, text, json, data: json?.data, error: json?.error, location: res.headers.get('location') }
}
const get = (who, path) => call(who, 'GET', path)

/** A real multipart upload: a tiny but genuine PDF header, so magic-byte sniffing passes. */
async function upload(who, path, typeKey) {
  const form = new FormData()
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'circular.pdf')
  form.append('documentTypeKey', typeKey)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, cookie: jars.get(who) ?? '' }, body: form, redirect: 'manual' })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, text, json, error: json?.error }
}

await login('admin', 'harness.admin')
await login('teacherA', 'harness.teacher.a')
await login('teacherB', 'harness.teacher.b')
await login('student', 'harness.student')
await login('unlinked', 'harness.unlinked')

const N = fx.notices
const E = fx.events
const titles = (r) => (r.data?.items ?? []).map((x) => x.title)
const has = (r, key) => titles(r).includes(N[key].title)
const hasE = (r, key) => titles(r).includes(E[key].title)

/* ========================================================================== */

heading('The office')

let r = await get('admin', '/api/v1/notices')
check('admin lists every notice, every status', r.status === 200 && r.data.total === 11, `${r.status} total=${r.data?.total}`)
check('the list carries no body of anybody’s user id or storage id', !r.text.includes('createdByUserId') && !r.text.includes('storage'))
r = await get('admin', '/api/v1/notices?status=DRAFT')
check('filters by status', r.status === 200 && r.data.total === 1 && has(r, 'draft'))
r = await get('admin', '/api/v1/notices?category=EXAM')
check('filters by category', r.status === 200 && r.data.total === 1 && has(r, 'pinned'))
r = await get('admin', '/api/v1/notices?search=section')
check('searches the title', r.status === 200 && r.data.total === 2)
r = await get('admin', '/api/v1/notices?status=LIVE')
check('a made-up status is a 400', r.status === 400, String(r.status))

r = await get('admin', '/api/v1/notices/options')
check('target options name classes, divisions, programmes, groups and sections', r.status === 200 && r.data.classes.length >= 2 && r.data.sections.length >= 3 && r.data.groups.length >= 2)
check('section options are labelled in full', r.data.sections.some((s) => /Section A · 1st Year · Boys · Pre-Medical/.test(s.label)))

r = await get('admin', `/api/v1/notices/${N.sec11A.id}`)
check('admin opens one notice with its targets and attachments', r.status === 200 && r.data.targets.length === 1 && r.data.attachments.length === 1)
check('the target is labelled, and its ids are the structure’s (needed by the form)', r.data.targets[0].label.startsWith('Section A') && r.data.targets[0].sectionId === ids.sec11A)
check('publishAt is given on the college clock as well', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.data.publishAtLocal))

heading('Writing a notice')

r = await call('admin', 'POST', '/api/v1/notices', { title: 'Harness notice', body: 'Hello.', targets: [{ audience: 'ALL' }] })
check('create → 201, a draft', r.status === 201 && r.data.status === 'DRAFT', `${r.status} ${r.text.slice(0, 120)}`)
const created = r.data?.id
check('audience summarised in words', r.data?.audienceSummary === 'Everyone')

r = await call('admin', 'POST', '/api/v1/notices', { title: 'Dup', body: 'x', targets: [{ audience: 'ALL' }, { audience: 'ALL' }] })
check('the same audience twice → 400 on targets', r.status === 400 && 'targets' in (r.error?.fields ?? {}), `${r.status}`)
r = await call('admin', 'POST', '/api/v1/notices', { title: 'Bad', body: 'x', targets: [{ audience: 'CLASS', classId: ids.class11, sectionId: ids.sec11A }] })
check('a class target carrying a section → 400', r.status === 400, String(r.status))
r = await call('admin', 'POST', '/api/v1/notices', { title: 'Bad', body: 'x', targets: [{ audience: 'SECTION', sectionId: '99999999-9999-4999-8999-999999999999' }] })
check('a section that does not exist → 400 with a sentence', r.status === 400 && /no longer exists/.test(r.error?.message ?? ''), `${r.status} ${r.error?.message}`)
r = await call('admin', 'POST', '/api/v1/notices', { title: 'Bad', body: 'x', targets: [{ audience: 'ALL' }], publishAt: '2026-09-10T08:00', expiresAt: '2026-09-09T08:00' })
check('expiring before publishing → 400 on expiresAt', r.status === 400 && 'expiresAt' in (r.error?.fields ?? {}))
r = await call('admin', 'POST', '/api/v1/notices', { title: 'Bad', body: 'x', targets: [{ audience: 'ALL' }], publishAt: '2026-09-10T08:00:00Z' })
check('a zoned time is refused; the college clock only', r.status === 400)

r = await call('admin', 'PATCH', `/api/v1/notices/${created}`, { status: 'PUBLISHED' })
check('publish → PUBLISHED', r.status === 200 && r.data.status === 'PUBLISHED')
r = await call('admin', 'PUT', `/api/v1/notices/${created}`, { title: 'Harness notice (edited)', body: 'Hello again.', targets: [{ audience: 'SECTION', sectionId: ids.sec11A }], publishAt: '2026-09-08T08:00' })
check('update replaces the audience', r.status === 200 && r.data.audienceSummary.startsWith('Section A') && r.data.targets.length === 1)
check('and converts the college-clock time to the instant five hours earlier', r.data.publishAt === '2026-09-08T03:00:00.000Z', r.data.publishAt)
r = await call('admin', 'PATCH', `/api/v1/notices/${created}`, { status: 'ARCHIVED' })
check('archive → ARCHIVED', r.status === 200 && r.data.status === 'ARCHIVED')
r = await call('admin', 'DELETE', `/api/v1/notices/${created}`)
check('a notice that was published cannot be deleted', r.status === 400, String(r.status))
r = await call('admin', 'POST', '/api/v1/notices', { title: 'Throwaway draft', body: 'x', targets: [{ audience: 'STAFF' }] })
const draft = r.data?.id
r = await call('admin', 'DELETE', `/api/v1/notices/${draft}`)
check('a draft can be deleted', r.status === 200)
r = await get('admin', `/api/v1/notices/${draft}`)
check('and is gone', r.status === 404)

r = await call('admin', 'POST', `/api/v1/notices/${N.sec11A.id}/attachments`, { nope: true })
check('an attachment must be a multipart upload → 400', r.status === 400, String(r.status))
r = await upload('admin', `/api/v1/notices/${N.sec11A.id}/attachments`, 'NOTICE_ATTACHMENT')
check('admin’s real upload passes validation and reaches storage (in-memory here → 201)', r.status === 201, `${r.status} ${r.error?.message?.slice(0, 60)}`)
const uploadedAttachment = r.json?.data?.id
r = await upload('admin', `/api/v1/notices/${N.sec11A.id}/attachments`, 'STUDENT_PHOTO')
check('a student document type cannot be attached to a notice → 400', r.status === 400, String(r.status))
r = await upload('admin', `/api/v1/notices/99999999-9999-4999-8999-999999999999/attachments`, 'NOTICE_ATTACHMENT')
check('attaching to a notice that does not exist → 404', r.status === 404, String(r.status))

heading('Writing an event')

r = await call('admin', 'POST', '/api/v1/events', { title: 'Harness event', startsAt: '2026-10-01T09:00', endsAt: '2026-10-01T12:00', location: 'Hall' })
check('create → 201, a draft for everyone', r.status === 201 && r.data.status === 'DRAFT' && r.data.audience === 'ALL', `${r.status}`)
const ev = r.data?.id
check('times on the college clock come back the same', r.data?.startsAtLocal === '2026-10-01T09:00' && r.data?.endsAtLocal === '2026-10-01T12:00')
r = await call('admin', 'POST', '/api/v1/events', { title: 'Bad', startsAt: '2026-10-01T09:00', audience: 'SECTION' })
check('an event for a section → 400', r.status === 400)
r = await call('admin', 'POST', '/api/v1/events', { title: 'Bad', startsAt: '2026-10-01T09:00', endsAt: '2026-10-01T08:00' })
check('ending before starting → 400', r.status === 400)
r = await call('admin', 'PATCH', `/api/v1/events/${ev}`, { status: 'PUBLISHED' })
check('publish → PUBLISHED', r.status === 200 && r.data.status === 'PUBLISHED')
r = await call('admin', 'PUT', `/api/v1/events/${ev}/cover`, { documentId: '99999999-9999-4999-8999-999999999999' })
check('a cover that is not one of the event’s own pictures → 400', r.status === 400)
r = await call('admin', 'PATCH', `/api/v1/events/${ev}`, { status: 'CANCELLED' })
check('cancel → CANCELLED', r.status === 200 && r.data.status === 'CANCELLED')
r = await call('admin', 'DELETE', `/api/v1/events/${ev}`)
check('a published event cannot be deleted', r.status === 400)
r = await get('admin', '/api/v1/events?upcoming=true')
check('upcoming filter leaves out the past event', r.status === 200 && !hasE(r, 'past') && hasE(r, 'all'))

/* ========================================================================== */

heading('A student in Section 11A')

r = await get('student', '/api/v1/notices/feed')
check('feed → 200', r.status === 200, String(r.status))
console.log('  [diag] student feed:', r.status, 'total=', r.data?.total, 'items=', titles(r).join(' | ') || '(none)', '| raw:', r.text.slice(0, 300))
check('sees everyone, students, their section, and the pinned one', ['everyone', 'students', 'sec11A', 'pinned'].every((k) => has(r, k)), titles(r).join(' | '))
check('does not see staff, another section, another class', !has(r, 'staff') && !has(r, 'sec11B') && !has(r, 'class12'))
check('does not see the draft, the scheduled, the expired or the archived', !has(r, 'draft') && !has(r, 'scheduled') && !has(r, 'expired') && !has(r, 'archived'))
check('the pinned notice comes first', titles(r)[0] === N.pinned.title, titles(r)[0])
check('the feed carries no status, no user ids and no storage ids', !r.text.includes('"status"') && !r.text.includes('UserId') && !r.text.includes('storage'))
r = await get('student', '/api/v1/notices/feed?category=EXAM')
check('a category narrows the feed', r.status === 200 && r.data.total === 1 && has(r, 'pinned'))
r = await get('student', `/api/v1/notices/feed?sectionId=${ids.sec11B}&staffId=${ids.staffB}`)
check('?sectionId= and ?staffId= are ignored, not honoured', r.status === 200 && !has(r, 'sec11B') && has(r, 'sec11A'))
r = await get('student', '/api/v1/notices/feed?category=GOSSIP')
check('a made-up category is a 400', r.status === 400)

r = await get('student', `/api/v1/notices/feed/${N.sec11A.id}`)
check('opens their section’s notice, with its attachments listed (the seeded one and the office’s upload)', r.status === 200 && r.data.attachments.length === 2, `${r.status} ${r.data?.attachments?.length}`)
for (const [key, why] of [['sec11B', 'another section'], ['draft', 'a draft'], ['scheduled', 'not yet published'], ['expired', 'expired'], ['archived', 'archived'], ['staff', 'staff only']]) {
  r = await get('student', `/api/v1/notices/feed/${N[key].id}`)
  check(`${why} → 404, not 403`, r.status === 404, String(r.status))
}

r = await get('student', `/api/v1/documents/${fx.attachments.onSec11A}/content`)
check('the seeded attachment passes the access check but points at no stored file → 404', r.status === 404, String(r.status))
{
  const res = await fetch(`${BASE}/api/v1/documents/${uploadedAttachment}/content`, { headers: { cookie: jars.get('student') ?? '' } })
  const bytes = new Uint8Array(await res.arrayBuffer())
  check('the office’s uploaded attachment streams back to the student as the PDF that was sent', res.status === 200 && (res.headers.get('content-type') ?? '').includes('pdf') && bytes[0] === 0x25 && bytes[1] === 0x50, `${res.status} ${res.headers.get('content-type')}`)
}
r = await get('student', `/api/v1/documents/${fx.attachments.onDraft}/content`)
check('a draft’s attachment is a 404 -- its existence is not confirmed', r.status === 404, String(r.status))
r = await get('student', `/api/v1/documents/${fx.attachments.onStaffEvent}/content`)
check('a staff event’s attachment is a 404 to a student', r.status === 404, String(r.status))

for (const [method, path, body] of [
  ['GET', '/api/v1/notices'],
  ['POST', '/api/v1/notices', { title: 'x', body: 'y', targets: [{ audience: 'ALL' }] }],
  ['GET', `/api/v1/notices/${N.everyone.id}`],
  ['PATCH', `/api/v1/notices/${N.everyone.id}`, { status: 'ARCHIVED' }],
  ['DELETE', `/api/v1/notices/${N.draft.id}`],
  ['GET', '/api/v1/notices/options'],
  ['GET', '/api/v1/events'],
  ['POST', '/api/v1/events', { title: 'x', startsAt: '2026-10-01T09:00' }],
]) {
  r = await call('student', method, path, body)
  check(`student ${method} ${path.replace(/\/[0-9a-f-]{36}/, '/<id>')} → 403`, r.status === 403, String(r.status))
}

r = await get('student', '/api/v1/events/feed')
check('events: sees the one for everyone, the students’ one and the cancelled one', hasE(r, 'all') && hasE(r, 'students') && hasE(r, 'cancelled'))
check('not the staff one, the draft or the past one', !hasE(r, 'staff') && !hasE(r, 'draft') && !hasE(r, 'past'))
check('the cancelled one says so', (r.data.items.find((e) => e.title === E.cancelled.title) ?? {}).status === 'CANCELLED')
r = await get('student', '/api/v1/events/feed?includePast=true')
check('the past comes back on request', hasE(r, 'past'))
r = await get('student', `/api/v1/events/feed/${E.staff.id}`)
check('a staff event → 404', r.status === 404)
r = await get('student', `/api/v1/events/feed/${E.draft.id}`)
check('a draft event → 404', r.status === 404)

heading('Teacher A (Section 11A and Class 12 Section B)')

r = await get('teacherA', '/api/v1/notices/feed')
check('sees everyone, staff, section 11A, class 12, pinned', ['everyone', 'staff', 'sec11A', 'class12', 'pinned'].every((k) => has(r, k)), titles(r).join(' | '))
check('not students-only, not section 11B, not draft/scheduled/expired/archived', !has(r, 'students') && !has(r, 'sec11B') && !has(r, 'draft') && !has(r, 'scheduled') && !has(r, 'expired') && !has(r, 'archived'))
r = await get('teacherA', `/api/v1/notices/feed/${N.sec11B.id}`)
check('another teacher’s section → 404', r.status === 404)
r = await get('teacherA', '/api/v1/events/feed')
check('events: everyone, staff and cancelled; not the students’ one', hasE(r, 'all') && hasE(r, 'staff') && hasE(r, 'cancelled') && !hasE(r, 'students'))
r = await get('teacherA', `/api/v1/documents/${fx.attachments.onStaffEvent}/content`)
check('the staff event’s seeded attachment passes the access check for staff (no stored file → 404)', r.status === 404, String(r.status))
r = await get('teacherA', '/api/v1/notices')
check('teacher cannot use the office list → 403', r.status === 403)
r = await upload('teacherA', `/api/v1/notices/${N.sec11A.id}/attachments`, 'NOTICE_ATTACHMENT')
check('teacher sending a real upload to a notice → 403', r.status === 403, String(r.status))
r = await upload('student', `/api/v1/events/${E.all.id}/attachments`, 'EVENT_IMAGE')
check('student sending a real upload to an event → 403', r.status === 403, String(r.status))

heading('Teacher B (Section 11B only)')

r = await get('teacherB', '/api/v1/notices/feed')
check('sees section 11B and not 11A or class 12', has(r, 'sec11B') && !has(r, 'sec11A') && !has(r, 'class12'))

heading('A staff login with no assignments')

r = await get('unlinked', '/api/v1/notices/feed')
check('sees only everyone, staff and pinned', ['everyone', 'staff', 'pinned'].every((k) => has(r, k)) && !has(r, 'sec11A') && !has(r, 'sec11B') && !has(r, 'class12'))

heading('Signed out')

r = await get('nobody', '/api/v1/notices/feed')
check('feed → 401', r.status === 401)
r = await get('nobody', '/api/v1/notices')
check('office list → 401', r.status === 401)
r = await get('nobody', `/api/v1/documents/${fx.attachments.onSec11A}/content`)
check('attachment → 401', r.status === 401)
check('no stack or Prisma name in any error', !r.text.includes('prisma') && !/\n\s+at /.test(r.text))

heading('The office screens')

r = await get('admin', '/admin/notices')
check('admin: the notices list renders', r.status === 200 && r.text.includes('Write a notice'), String(r.status))
check('it lists the seeded notices with their status', r.text.includes(N.everyone.title) && r.text.includes('Draft'))
r = await get('admin', '/admin/notices?status=DRAFT')
check('the status filter narrows the page', r.status === 200 && r.text.includes(N.draft.title) && !r.text.includes(N.sec11B.title))
r = await get('admin', `/admin/notices/${N.sec11A.id}`)
check('one notice renders with its audience, body and attachment', r.status === 200 && r.text.includes('Section A') && r.text.includes('circular.pdf') && r.text.includes('Publish'))
check('the page carries no storage id or user id', !r.text.includes('harness-file') && !r.text.includes('createdByUserId'))
r = await get('admin', '/admin/notices/99999999-9999-4999-8999-999999999999')
check('a notice that does not exist is a 404 page', r.status === 404)
r = await get('admin', '/admin/events')
check('admin: the events list renders', r.status === 200 && r.text.includes('Create event') && r.text.includes(E.all.title))
r = await get('admin', `/admin/events/${E.staff.id}`)
check('one event renders with its attachment and actions', r.status === 200 && r.text.includes('circular.pdf') && r.text.includes('Publish'))
r = await get('admin', '/admin')
check('the admin dashboard still renders', r.status === 200)

for (const who of ['student', 'teacherA', 'nobody']) {
  for (const path of ['/admin/notices', `/admin/notices/${N.everyone.id}`, '/admin/events']) {
    r = await get(who, path)
    check(`${who} is sent away from ${path.replace(/\/[0-9a-f-]{36}/, '/<id>')}`, r.status === 307, String(r.status))
  }
}

heading('The portal screens')

r = await get('student', '/student/notices')
check('student: the notices page renders their notices only', r.status === 200 && r.text.includes(N.sec11A.title) && r.text.includes(N.everyone.title) && !r.text.includes(N.sec11B.title) && !r.text.includes(N.draft.title), String(r.status))
check('it names the attachment of their section’s notice', r.text.includes('circular.pdf'))
check('it offers nothing that writes', !/Write a notice|Publish|Archive|Delete/.test(r.text.split('<main')[1] ?? r.text))
r = await get('student', '/student/events')
check('student: the events page renders the students’ event and not the staff one', r.status === 200 && r.text.includes(E.students.title) && !r.text.includes(E.staff.title))
r = await get('student', '/student')
check('the student dashboard carries the latest notices and upcoming events', r.status === 200 && r.text.includes(N.pinned.title) && r.text.includes(E.all.title) && r.text.includes('/student/notices'))
check('and nothing of another section’s', !r.text.includes(N.sec11B.title))

r = await get('teacherA', '/staff/notices')
check('teacher A: notices page shows their sections and class, not B’s', r.status === 200 && r.text.includes(N.sec11A.title) && r.text.includes(N.class12.title) && !r.text.includes(N.sec11B.title) && !r.text.includes(N.students.title))
r = await get('teacherA', '/staff/events')
check('teacher A: events page shows the staff event, not the students’ one', r.status === 200 && r.text.includes(E.staff.title) && !r.text.includes(E.students.title))
r = await get('teacherA', '/staff')
check('the staff dashboard carries notices and events beside today’s classes', r.status === 200 && r.text.includes(N.staff.title) && r.text.includes(E.staff.title) && /Today.s classes/.test(r.text))
r = await get('teacherB', '/staff/notices')
check('teacher B sees section 11B and not 11A', r.status === 200 && r.text.includes(N.sec11B.title) && !r.text.includes(N.sec11A.title))
r = await get('unlinked', '/staff/notices')
check('an unlinked staff login sees only the population notices', r.status === 200 && r.text.includes(N.staff.title) && !r.text.includes(N.sec11A.title))
r = await get('admin', '/admin')
check('the admin dashboard no longer lists anything as not built', r.status === 200 && !r.text.includes('Not built yet'))
r = await get('student', '/staff/notices')
check('a student is sent away from the staff feed', r.status === 307)
r = await get('nobody', '/student/notices')
check('signed out is sent to login', r.status === 307 && (r.location ?? '').startsWith('/login'))

heading('Phase 12: the dashboards')

r = await get('admin', '/api/v1/dashboard')
check('the admin dashboard API carries the operations block', r.status === 200 && r.data.operations && ['attendance', 'exams', 'communication', 'timetable', 'documents'].every((k) => k in r.data.operations), String(r.status))
check('notices showing counts exactly the published, in-window ones (7)', r.data?.operations?.communication?.noticesShowing === 7, String(r.data?.operations?.communication?.noticesShowing))
check('events in the next 30 days counts the published upcoming ones (3)', r.data?.operations?.communication?.eventsNext30Days === 3, String(r.data?.operations?.communication?.eventsNext30Days))
check('timetable coverage counts sections with lessons (3 of 3 seeded with slots… of 4)', r.data?.operations?.timetable?.sections === 3 && r.data?.operations?.timetable?.sectionsWithLessons === 3, JSON.stringify(r.data?.operations?.timetable))
check('attendance this month has no figure yet, not 0%', r.data?.operations?.attendance?.monthPercentage === null)
check('today is on the college clock', /^\d{4}-\d{2}-\d{2}$/.test(r.data?.today ?? ''))
r = await get('student', '/api/v1/dashboard')
check('a student gets 403 from the admin dashboard API', r.status === 403)
r = await get('teacherA', '/api/v1/dashboard')
check('a teacher gets 403 from the admin dashboard API', r.status === 403)

r = await get('admin', '/admin')
check('the admin dashboard shows Today and Session tiles', r.status === 200 && /Today · (?:<!-- -->)?\d{4}-\d{2}-\d{2}/.test(r.text) && r.text.includes('Registers taken today') && r.text.includes('Results awaiting publication') && r.text.includes('Sections with a timetable'))
check('attendance this month is shown as no figure, not 0%', r.text.includes('No attendance submitted yet this month'))
r = await get('teacherA', '/staff')
check('the staff dashboard shows registers today and open mark sheets', r.status === 200 && r.text.includes('Registers today') && r.text.includes('Mark sheets open'))
r = await get('student', '/student')
check('the student dashboard shows attendance, results and the next paper', r.status === 200 && r.text.includes('Attendance this session') && r.text.includes('Published results') && r.text.includes('Next exam paper'))
check('with no attendance yet it says so rather than 0%', r.text.includes('No attendance taken yet'))

heading('Phase 12: the roadmap’s acceptance criterion — loads under a second')

{
  const times = []
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now()
    const res = await get('admin', '/api/v1/dashboard')
    times.push(performance.now() - t0)
    if (res.status !== 200) times.push(Number.POSITIVE_INFINITY)
  }
  const worst = Math.max(...times)
  check(`the admin dashboard API answers in under 1 s on every one of 5 runs (worst ${worst.toFixed(0)} ms)`, worst < 1000, times.map((t) => t.toFixed(0)).join(' / '))
  console.log(`  [timing] dashboard api ms: ${times.map((t) => t.toFixed(0)).join(' / ')}`)
  const pages = []
  for (const [who, path] of [['admin', '/admin'], ['teacherA', '/staff'], ['student', '/student']]) {
    const t0 = performance.now()
    await get(who, path)
    pages.push(`${path} ${(performance.now() - t0).toFixed(0)}ms`)
  }
  console.log(`  [timing] dashboard pages: ${pages.join(' · ')}`)
}

heading('Phase 13: the report centre')

{
  const csvOf = async (who, path) => {
    const res = await fetch(`${BASE}${path}`, { headers: { origin: BASE, cookie: jars.get(who) ?? '' }, redirect: 'manual' })
    // fetch().text() strips a leading byte-order mark by spec, so read the bytes.
    const bytes = new Uint8Array(await res.arrayBuffer())
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    const text = new TextDecoder('utf-8').decode(bytes)
    return { status: res.status, text, hasBom, type: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', cache: res.headers.get('cache-control') ?? '' }
  }
  const dataRows = (text) => text.replace(/^﻿/, '').split('\r\n').filter((l) => l.length > 0).length - 1

  // Students: the JSON the screen shows and the CSV the button downloads are one query.
  r = await get('admin', `/api/v1/reports/students?academicSessionId=${ids.session}`)
  check('students report → 200 with groups and a total', r.status === 200 && Array.isArray(r.data.groups) && r.data.total === 1, `${r.status} total=${r.data?.total}`)
  check('the student row carries placement and no ids', r.data.groups[0]?.rows[0]?.sectionName === 'A' && !r.text.includes('"id"'))
  let csv = await csvOf('admin', `/api/v1/reports/students?academicSessionId=${ids.session}&format=csv`)
  check('the same query as CSV → 200 text/csv, as an attachment, never cached', csv.status === 200 && csv.type.startsWith('text/csv') && /attachment; filename="students-/.test(csv.disposition) && /no-store/.test(csv.cache), `${csv.status} ${csv.type} ${csv.disposition}`)
  check('the CSV starts with the byte-order mark Excel needs (on the wire: EF BB BF)', csv.hasBom)
  check('the CSV has exactly the rows the JSON has', dataRows(csv.text) === r.data.total, `${dataRows(csv.text)} vs ${r.data.total}`)
  check('the CSV names the student and their section', csv.text.includes('Ali Raza') && csv.text.split('\r\n')[1]?.includes(',A,'))

  r = await get('admin', `/api/v1/reports/students?academicSessionId=${ids.session}&sectionId=${ids.sec11B}`)
  check('narrowing to a section with nobody in it gives zero rows, not an error', r.status === 200 && r.data.total === 0)
  r = await get('admin', `/api/v1/reports/students?academicSessionId=${ids.session}&groupBy=section`)
  check('grouping by section labels the group in full', r.status === 200 && /Section A/.test(r.data.groups[0]?.label ?? ''), r.data?.groups?.[0]?.label)

  r = await get('admin', '/api/v1/reports/staff?groupBy=designation')
  csv = await csvOf('admin', '/api/v1/reports/staff?groupBy=designation&format=csv')
  check('staff report: JSON rows equal CSV rows', r.status === 200 && dataRows(csv.text) === r.data.total && r.data.total === 2, `${dataRows(csv.text)} vs ${r.data?.total}`)
  check('grouped CSV carries a Group column first', csv.text.replace(/^﻿/, '').startsWith('Group,Staff code,'))

  r = await get('admin', `/api/v1/reports/missing-documents?academicSessionId=${ids.session}`)
  csv = await csvOf('admin', `/api/v1/reports/missing-documents?academicSessionId=${ids.session}&format=csv`)
  check('missing documents: the one student is missing every required type', r.status === 200 && r.data.total === 1 && r.data.groups[0]?.rows[0]?.missing.length === r.data.types.length && r.data.types.length >= 1, `${r.status} ${JSON.stringify(r.data?.groups?.[0]?.rows?.[0]?.missing)}`)
  check('missing documents: JSON rows equal CSV rows', dataRows(csv.text) === r.data.total)

  r = await get('admin', '/api/v1/reports/exams?examId=99999999-9999-4999-8999-999999999999')
  check('an exam that does not exist → 404', r.status === 404, String(r.status))
  r = await get('admin', '/api/v1/reports/results')
  check('a result report without an exam → 400', r.status === 400, String(r.status))
  r = await get('admin', '/api/v1/reports/students?format=pdf')
  check('a format the server cannot write → 400', r.status === 400, String(r.status))
  r = await get('admin', `/api/v1/reports/attendance?academicSessionId=${ids.session}`)
  check('the attendance export answers with the overview and the students', r.status === 200 && r.data.overview && Array.isArray(r.data.students), String(r.status))

  for (const who of ['student', 'teacherA', 'unlinked']) {
    r = await get(who, `/api/v1/reports/students?academicSessionId=${ids.session}`)
    check(`${who}: the report API is 403`, r.status === 403, String(r.status))
    csv = await csvOf(who, `/api/v1/reports/students?format=csv`)
    check(`${who}: and so is the CSV`, csv.status === 403, String(csv.status))
  }
  r = await get('nobody', '/api/v1/reports/staff')
  check('signed out → 401', r.status === 401, String(r.status))

  r = await get('admin', '/admin/reports')
  check('the report centre page renders for the office', r.status === 200 && r.text.includes('Download CSV') && r.text.includes('Missing documents'), String(r.status))
  for (const who of ['student', 'teacherA', 'nobody']) {
    r = await get(who, '/admin/reports')
    check(`${who} is sent away from the report centre`, r.status === 307, String(r.status))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
}
