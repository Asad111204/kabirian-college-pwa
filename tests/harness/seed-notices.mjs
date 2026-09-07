/**
 * Phase 11 fixtures for the THROWAWAY database: notices with every kind of
 * target and window, events for every audience, and two attachment rows.
 * Runs after seed.mjs --data. Never pointed at Neon.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(PROJECT, 'package.json'))
const pg = require('pg')

const ids = JSON.parse(readFileSync(new URL('./ids.json', import.meta.url), 'utf8'))
const client = new pg.Client({
  connectionString: 'postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable',
})
await client.connect()

let n = 100
const uid = () => `bbbbbbbb-0000-4000-8000-${String(++n).padStart(12, '0')}`
const hours = (h) => new Date(Date.now() + h * 3600_000).toISOString()

const out = { notices: {}, events: {}, attachments: {} }

async function notice(key, { title, targets, status = 'PUBLISHED', publishAt = hours(-1), expiresAt = null, category = 'GENERAL', pinned = false }) {
  const id = uid()
  await client.query(
    `INSERT INTO notices (id, title, body, category, status, publish_at, expires_at, is_pinned, created_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [id, title, `Body of ${title}.`, category, status, publishAt, expiresAt, pinned, ids.userAdmin],
  )
  for (const t of targets) {
    await client.query(
      `INSERT INTO notice_targets (id, notice_id, audience, class_id, division_id, program_id, academic_group_id, section_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uid(), id, t.audience, t.classId ?? null, t.divisionId ?? null, t.programId ?? null, t.academicGroupId ?? null, t.sectionId ?? null],
    )
  }
  out.notices[key] = { id, title }
}

await notice('everyone', { title: 'Everyone published', targets: [{ audience: 'ALL' }] })
await notice('students', { title: 'Students only', targets: [{ audience: 'STUDENTS' }] })
await notice('staff', { title: 'Staff only', targets: [{ audience: 'STAFF' }] })
await notice('sec11A', { title: 'Section 11A only', targets: [{ audience: 'SECTION', sectionId: ids.sec11A }] })
await notice('sec11B', { title: 'Section 11B only', targets: [{ audience: 'SECTION', sectionId: ids.sec11B }] })
await notice('class12', { title: 'Class 12 only', targets: [{ audience: 'CLASS', classId: ids.class12 }] })
await notice('draft', { title: 'Draft for everyone', targets: [{ audience: 'ALL' }], status: 'DRAFT' })
await notice('scheduled', { title: 'Scheduled tomorrow', targets: [{ audience: 'ALL' }], publishAt: hours(24) })
await notice('expired', { title: 'Expired yesterday', targets: [{ audience: 'ALL' }], publishAt: hours(-48), expiresAt: hours(-24) })
await notice('archived', { title: 'Archived', targets: [{ audience: 'ALL' }], status: 'ARCHIVED' })
await notice('pinned', { title: 'Pinned exam notice', targets: [{ audience: 'ALL' }], pinned: true, category: 'EXAM' })

async function event(key, { title, audience = 'ALL', status = 'PUBLISHED', startsAt = hours(24 * 7), endsAt = null }) {
  const id = uid()
  await client.query(
    `INSERT INTO events (id, title, description, starts_at, ends_at, location, audience, status, created_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Main hall', $6, $7, $8, now(), now())`,
    [id, title, `About ${title}.`, startsAt, endsAt, audience, status, ids.userAdmin],
  )
  out.events[key] = { id, title }
}

await event('all', { title: 'Sports day' })
await event('students', { title: 'Students picnic', audience: 'STUDENTS' })
await event('staff', { title: 'Staff meeting', audience: 'STAFF' })
await event('draft', { title: 'Draft gala', status: 'DRAFT' })
await event('cancelled', { title: 'Cancelled fete', status: 'CANCELLED' })
await event('past', { title: 'Last month picnic', startsAt: hours(-24 * 30), endsAt: hours(-24 * 30 + 2) })

// Attachment rows, inserted directly: Drive is not configured in the harness,
// so the point is the ACCESS decision, which happens before any download.
async function attachment(key, ownerCol, ownerId, typeKey) {
  const id = uid()
  await client.query(
    `INSERT INTO documents (id, document_type_key, ${ownerCol}, storage_provider, storage_file_id, file_name, original_file_name,
        mime_type, file_size_bytes, checksum_sha256, status, uploaded_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'google_drive', $4, 'a.pdf', 'circular.pdf', 'application/pdf', 10, repeat('a', 64), 'ACTIVE', $5, now(), now())`,
    [id, typeKey, ownerId, `harness-file-${id}`, ids.userAdmin],
  )
  out.attachments[key] = id
}
await attachment('onSec11A', 'notice_id', out.notices.sec11A.id, 'NOTICE_ATTACHMENT')
await attachment('onDraft', 'notice_id', out.notices.draft.id, 'NOTICE_ATTACHMENT')
await attachment('onStaffEvent', 'event_id', out.events.staff.id, 'EVENT_ATTACHMENT')

writeFileSync(new URL('./ids-notices.json', import.meta.url), JSON.stringify(out, null, 2))
const c = await client.query(`SELECT (SELECT count(*) FROM notices) n, (SELECT count(*) FROM notice_targets) t, (SELECT count(*) FROM events) e, (SELECT count(*) FROM documents) d`)
console.log('  seeded:', c.rows[0])
await client.end()
