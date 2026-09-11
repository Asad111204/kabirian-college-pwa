# Kabirian College Management System — Project Plan

| | |
|---|---|
| **Status** | **Phase 28 complete: the fee is annual, made of optional heads, and paid in instalments.** Google Drive stays connected (`kabiriancollege@gmail.com`, folders created, live connection test passing). Everything through Phase 29 is live on Neon (nineteen migrations, zero drift). The college charges one fee per student per year, built from tuition, annual funds, events, board registration, board admission, a tour and anything else, all optional and all set at admission; families pay whenever they can, and a printed voucher shows only what has been paid and what is left. Documents are attached at the counter, and a salary is recorded when staff are added. The college now has a printable **handbook** covering every part of the system, and the app finally shows the college's own logo rather than a placeholder. **The Phase 28 migration was applied to Neon on 2026-09-09.** The college's previous FoxPro system has been read into this one: **188 of its 192 enrolled students are live, each with a portal login**, every class counted back against the old file, and **its 2026-27 fee ledger with them**: 111 students charged Rs 3,449,930 for the year, Rs 273,200 already received, reconciled to the rupee. |
| **Last updated** | 2026-09-10 (rev. 56 — copying a day of the week) |
| **Companion docs** | [DECISIONS.md](DECISIONS.md) · [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) · [README.md](README.md) |

---

## 1. Project overview

A production-grade, installable **Progressive Web App** that becomes the single platform for running Kabirian College: students, staff, academics, attendance, exams, results, timetables, notices, events, documents (stored in Google Drive), reports and audit logs.

Three portals share one codebase, one database and one permission system:

| Portal | Who | Purpose |
|---|---|---|
| **Admin** | College administration | Full management of the college |
| **Staff / Teacher** | Teachers & staff | Attendance, marks, timetable, notices for *assigned* classes only |
| **Student** | Students | Read-only view of *their own* academic life |

Non-negotiables: security first (CNIC / B-Form / marks are sensitive), server-side authorization, no fake integrations, no hard-coded secrets, maintainable code a future developer can understand.

---

## 2. Requirements summary

### 2.1 Functional modules

| Module | Admin | Staff | Student |
|---|---|---|---|
| Dashboard | KPIs, quick actions | Today's classes, pending attendance, exams, notices | Attendance %, timetable, exams, results, notices |
| Students | Full CRUD, search/filter, enrol, transfer, promote, leave, history, documents | View students of assigned sections (limited fields) | Own profile |
| Staff | Full CRUD, assignments, documents | Own profile, own assignments | Teachers of own subjects |
| Academics | Sessions, classes/years, divisions, programs, academic groups, sections, subjects, curriculum, teacher assignments | Read | Read (own) |
| Attendance | View/edit/correct, reports | Mark, submit, history, correct (if permitted) | Own attendance + % |
| Exams & marks | Exam types, exams, papers, marks view/edit, locking | Enter/save/submit marks for assigned papers | Exam schedule |
| Results | Generate, publish/unpublish, ranking, history | View assigned classes' results | Own *published* results |
| Timetable | Build/edit | Own timetable | Class timetable |
| Notices & events | CRUD, audience targeting, scheduling, attachments | Read (targeted) | Read (targeted) |
| Documents | Upload/view/download/replace/delete, checklist, missing-document reports | Own documents (view) | Own documents (view) |
| Reports | Student, staff, attendance, exam, result, missing documents; print/PDF/CSV | — | — |
| Users & permissions | Create, activate/deactivate, reset password, roles, permission overrides | — | — |
| Audit logs | View, filter | — | — |

### 2.2 Non-functional requirements

- Installable PWA on Android, iOS, Windows, macOS; responsive from 320 px phones to desktops.
- Server-side authorization on every request; students only see their own data; staff only see assigned sections.
- Scales to thousands of students and hundreds of thousands of attendance/marks rows: server-side pagination, indexes, no bulk client loads.
- Multiple academic sessions; history is never destroyed.
- Every important action audited.
- Google Drive stores files; PostgreSQL stores everything else; storage provider is swappable.
- Validation on client (UX) and server (truth). Friendly errors to users, technical logs on the server.

---

## 3. Technology stack

| Layer | Choice | Why (in plain words) |
|---|---|---|
| Language | **TypeScript (strict)** | One language for frontend + backend; the compiler catches a large class of bugs before they reach users. |
| Framework | **Next.js (App Router)** — Node runtime | One project gives us the React UI, the server API, server rendering and routing. Fewer moving parts than a separate frontend + backend for a beginner, yet fully production-grade. |
| UI | **Tailwind CSS + shadcn/ui** (Radix primitives) | Professional, accessible components (tables, dialogs, drawers, toasts…) that live *in our repo* so we can customise them. Mobile-first by default. |
| Forms | **react-hook-form + Zod** | Same Zod schema validates in the browser (fast feedback) and on the server (real security). |
| Tables / data | **TanStack Table + TanStack Query** | Server-driven pagination, sorting, filtering; cached client fetching with loading/error states. |
| Database | **PostgreSQL** | Mature relational DB with real constraints, transactions, indexes, JSONB, date types — exactly what academic data needs. |
| DB hosting | **Neon** (serverless Postgres) for dev *and* prod (separate branches) — local PostgreSQL install is an alternative | No Docker on this machine; Neon gives a connection string in 2 minutes, free tier for dev, automatic backups/PITR for prod. |
| ORM / migrations | **Prisma ORM** | Readable schema file, generated type-safe client, versioned migrations, Prisma Studio GUI to inspect data. Best beginner experience without sacrificing production use. |
| Authentication | **Custom database-session auth** (Argon2id password hashing, HttpOnly cookies) | Our needs are simple and unusual for auth libraries: no self-signup, no social login, admin-provisioned accounts, username (not email) login, instant revocation. ~300 well-tested lines beat fighting a library. See [DECISIONS.md → ADR-005](DECISIONS.md). |
| Password hashing | **Argon2id** (`@node-rs/argon2`, prebuilt binaries) | Current OWASP recommendation. Fallback: `bcryptjs` if native install fails on Windows. |
| Validation | **Zod** | Shared schemas; env-variable validation at boot. |
| Google Drive | **`@googleapis/drive` + `google-auth-library`** (server only) | Official client, scoped to Drive only (much smaller than the monolithic `googleapis`). Auth mode pending confirmation (see §9, Q1). |
| File validation | **`file-type`** (magic-byte sniffing) + **`sharp`** (thumbnails) | Never trust the browser's MIME type. |
| PWA | **Serwist** (`@serwist/next`) + `app/manifest.ts` | Maintained successor of next-pwa; Workbox-style caching strategies with an explicit "never cache API" rule. |
| Logging | **pino** | Structured server logs; secrets/PII redaction. |
| Testing | **Vitest** (unit + integration) · **Playwright** (E2E, responsive, PWA) | Fast, TypeScript-native; Playwright drives real browsers on phone and desktop viewports. |
| Tooling | ESLint, Prettier, **npm** (already installed), Husky pre-commit (lint + typecheck) | Consistency without extra installs. |
| Hosting | **Vercel** (free, uploads capped at 4 MB) with a **Docker standalone image** as the second door; Neon Postgres | Decided in Phase 17 (ADR-163): the college already deploys to Vercel from GitHub; the image is built and started by CI so the alternative stays real. |

Exact versions will be checked and **pinned** at Phase 1 setup time (the ecosystem moves fast — Next 16, Prisma 7, Tailwind 4, Zod 4).

---

## 4. System architecture

### 4.1 Big picture

```
┌──────────────────────────── Browser / Installed PWA ────────────────────────────┐
│  React UI (Next.js App Router) · Service Worker (static caching only) · Manifest │
└───────────────┬───────────────────────────────────────────┬──────────────────────┘
                │ HTML (server-rendered pages)              │ JSON / multipart over HTTPS
                ▼                                           ▼
┌──────────────────────────────── Next.js server (Node) ───────────────────────────┐
│  app/ (routes)  ──▶  Route Handlers  /api/v1/**   ──▶  ┌──────────────────────┐  │
│  Server Components ─────────────────────────────────▶  │   SERVICE LAYER      │  │
│                                                        │  auth · authorize()  │  │
│   proxy.ts (coarse redirect only, NOT security)        │  business rules      │  │
│                                                        │  audit logging       │  │
│                                                        └───┬──────────┬───────┘  │
│                                                            │          │          │
│                                                   Prisma   │          │ StorageProvider
└────────────────────────────────────────────────────────────┼──────────┼──────────┘
                                                             ▼          ▼
                                                     PostgreSQL     Google Drive API
                                                     (Neon)        (server credentials)
```

### 4.2 Layers and rules

| Layer | Lives in | Responsibility | Rule |
|---|---|---|---|
| Routes / pages | `src/app/**` | Thin: read session, call a service, render | No business logic here |
| Route handlers (API) | `src/app/api/v1/**` | Parse + validate input (Zod), call service, map errors → HTTP | Every handler wrapped in `withAuth()` |
| **Service layer** | `src/server/services/**` | **All business logic and all authorization** | Every public function takes an `AuthContext` and calls `authorize()` first |
| Data access | Prisma client via services | Queries, transactions | No raw client access from routes/components |
| Storage | `src/server/storage/**` | `StorageProvider` interface + `GoogleDriveProvider` | Only the documents service talks to storage |
| Audit | `src/server/audit/**` | `audit.log(ctx, action, entity, before, after)` inside the same transaction | Called by services, never by routes |

Why services are the boundary: pages, API handlers, background scripts and tests all go through the same functions, so authorization cannot be accidentally skipped by adding a new page.

### 4.3 Request lifecycle (example: teacher submits attendance)

1. Browser `POST /api/v1/attendance/sheets` with JSON (validated client-side with the shared Zod schema).
2. `withAuth()` reads the `kc_session` cookie → looks up the session row → loads user + permissions → builds `AuthContext`.
3. Handler validates body with the *same* Zod schema (server is the source of truth).
4. `attendanceService.submitSheet(ctx, input)`:
   - `authorize(ctx, 'attendance.create')`
   - scope check: a `teacher_assignments` row must exist for (this staff, subject, class, section, current session)
   - transaction: upsert sheet + entries, unique constraint prevents duplicates, write audit log
5. Handler returns `201 { data }`; errors are mapped to `400/401/403/404/409/500` with safe messages; details logged with pino.

### 4.4 Deployment topology (provisional, Phase 17)

```
Users (phones/laptops) ⇄ HTTPS ⇄ Next.js container (Node 24) ⇄ Neon PostgreSQL (TLS)
                                            ⇄ Google Drive API (TLS, server credentials)
```

---

## 5. Authentication architecture

### 5.1 Model

- **Accounts are created by Admin only** (no public sign-up). Every student and staff member *may* have a linked user account; creating the account is a separate admin action.
- **Login identifier = username** (default: the person's code, e.g. `STU-0001`, `STF-0001`; admins choose their own). Email is optional. Rationale: many students have no email; codes are printed on ID cards.
- **Password storage:** Argon2id hash only. Plaintext never stored or logged.
- **Sessions:** random 256-bit token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie (`kc_session`). Only the **SHA-256 hash** of the token is stored in the `sessions` table. Sliding expiry (30 days max, renewed on activity), revocable instantly.
- **First login:** admin creates the account with a generated temporary password (shown once). `must_change_password = true` forces a password change before anything else.
- **Password reset (v1):** admin-initiated — generates a new temporary password, revokes all sessions, audited. *(v2: email-based reset when an email provider is configured.)*
- **Account activation/deactivation:** `users.status`; deactivating deletes all sessions → immediate lock-out (an advantage of DB sessions over JWTs).
- **Brute-force protection:** per-IP and per-username rate limiting; account lock for 15 minutes after 10 failures; constant-time behaviour for unknown usernames; generic error message.
- **Password policy:** minimum 10 characters, not equal to username, checked against a small common-password list; strength meter in UI.
- **CSRF:** `SameSite=Lax` cookie + `Origin`/`Sec-Fetch-Site` check on all state-changing API requests.
- **Transport & headers:** HTTPS only in production, HSTS, CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

### 5.2 Flows

```
Login   POST /api/v1/auth/login  {username,password}
        → rate-limit → find user → status ACTIVE & not locked → argon2 verify
        → create session (store hash) → Set-Cookie → audit auth.login
        → { role, mustChangePassword }  → client routes to /admin | /staff | /student | /change-password

Every request
        cookie → sha256 → sessions ⨝ users → expiry & status check → AuthContext
        (permissions resolved: role defaults + per-user overrides)

Logout  DELETE session row + clear cookie.   "Sign out everywhere" = delete all user sessions.
```

### 5.3 Route protection

- `proxy.ts` (Next.js request proxy, formerly `middleware.ts`) only redirects users without a cookie to `/login` and users of the wrong role away from another portal's URLs. **It is a convenience, not security** — the real check is in every service call. (This also protects against middleware-bypass class bugs such as CVE-2025-29927.)

---

## 6. Authorization architecture (RBAC + scoping)

### 6.1 Three layers of checks

1. **Authentication** — valid session, active user.
2. **Permission** — does this user hold `students.view`, `marks.enter`, …?
   `effective = rolePermissions[role] + userPermissions(GRANT) − userPermissions(REVOKE)`
3. **Scope** — is this user allowed to touch *this particular* record?

| Role | Scope rule |
|---|---|
| ADMIN | Whole college (subject to permissions; a "system owner" account cannot be deactivated or stripped of `users.manage`). |
| STAFF | Only the **sections + subjects** in their active `teacher_assignments`, plus sections where they are `incharge_staff_id`. Because a section carries its group, this automatically limits them to the right class, division and program — a Boys Pre-Medical teacher never reaches Girls ICS. Student data is projected to a **limited DTO** (name, roll no, photo, class/division/program/section, guardian phone) — never CNICs, addresses or documents. |
| STUDENT | Only rows where `student_id = ctx.studentId`. Results only if `is_published`. Notices/events only if targeted at them. |

### 6.2 Permission catalogue (seeded data, extensible)

```
dashboard.view
students.view  students.create  students.update  students.delete  students.enroll  students.promote  students.export
staff.view     staff.create     staff.update     staff.delete     staff.assign
academics.view academics.manage    # sessions, classes, divisions, programs, groups, sections, subjects, curriculum
academics.assign_teachers
attendance.view attendance.create attendance.update attendance.update_submitted
exams.view     exams.manage
marks.view     marks.enter      marks.update     marks.update_submitted
results.view   results.generate results.publish
timetable.view timetable.manage
notices.view   notices.manage
events.view    events.manage
documents.view documents.upload documents.replace documents.delete documents.view_sensitive
reports.generate
users.view     users.manage     permissions.manage
audit.view
settings.manage
```

Default grants: ADMIN → all; STAFF → `dashboard.view, students.view(scoped), attendance.*` (except `update_submitted`), `marks.view/enter/update`, `exams.view, results.view, timetable.view, notices.view, events.view, documents.view(own)`; STUDENT → read-only own-scope permissions. Admin can grant a specific teacher extra permissions (e.g. `attendance.update_submitted`) without changing their role.

### 6.3 Enforcement helpers

```ts
authorize(ctx, 'attendance.create')                       // throws ForbiddenError
assertStaffAssigned(ctx, { sectionId, subjectId })        // checks teacher_assignments / section in-charge
assertStudentSelf(ctx, studentId)
projectStudent(student, ctx)   // returns full / limited / self DTO by role
```

The **authorization matrix** (who can do what to whose data) becomes a permanent test suite in Phase 2 and grows with every module.

---

## 7. Academic structure of Kabirian College

### 7.1 The real structure (confirmed 2026-08-28)

| Level | Values today |
|---|---|
| Class / Year | **1st Year (11th Class)**, **2nd Year (12th Class)** |
| Division | **Boys**, **Girls** |
| Program / Group | **Pre-Medical**, **Pre-Engineering**, **ICS Physics**, **ICS Economics**, **FAIT** |
| Section | at least **A** per combination; more can be added any time |

2 classes × 2 divisions × 5 programs = **20 academic groups** per session, each with one or more sections.

**None of this is hard-coded.** Classes, divisions, programs, subjects and sections are database rows managed by Admin in the Academic Management area. Adding "3rd Year", a new division, or a program such as "Pre-Medical (Evening)" is data entry, not a code change.

### 7.2 How it is modelled (and why not literal nesting)

The requested chain is *Class → Division → Program → Section*. Modelling that as four physically nested tables would store "Pre-Medical" once **per class per division** — four copies of the same program that can be renamed independently and drift apart, and the same again next session.

The normalized shape keeps the exact same hierarchy but stores each concept once:

```
BUILDING BLOCKS (defined once, reused every session, admin-managed)
   classes · divisions · programs · subjects

STRUCTURE OF ONE SESSION (only the combinations that actually exist)
   academic_sessions
     └── academic_groups   = Session × Class × Division × Program     (20 rows today)
           └── sections    = A, B, …                                  (students & teaching happen here)
   curriculum_subjects     = Session × Class × Program → Subjects     (10 subject lists today)

PEOPLE
   student_enrollments     Student → Section  (+ roll no, status)
   teacher_assignments     Staff   → Section + Subject
```

`academic_groups` is the row that means *"1st Year · Boys · Pre-Medical exists in 2026-27"*. A **section** points at its group, so reading a section upwards gives class, division, program and session — the full hierarchy — without duplicating any name.

**Why this is better than literal nesting**

| Aspect | Nested tables | Groups + sections (chosen) |
|---|---|---|
| Renaming "FAIT" → "FA-IT" | edit up to 4 rows per session, easy to miss one | edit 1 row in `programs` |
| Next session has different programs | rebuild the whole tree | create/omit `academic_groups` rows |
| "All Pre-Medical students, both divisions" | join through 4 levels, hope names match | filter `academic_groups.program_id` |
| Adding a level later (e.g. Shift = Morning/Evening) | new nested table, migrate everything below | add `shift_id` to `academic_groups` |
| Risk of a section under the wrong class | possible | impossible — a section has exactly one group |

The user-facing UI still reads exactly as you described: *Session → Class → Division → Program → Section → Students*. `academic_groups` is the plumbing behind that path, not a screen the admin thinks about.

### 7.3 Subjects: per class × program, not per student and not global

Different programs study different subjects, so there is no universal subject list. `curriculum_subjects` stores one list per **session × class × program** (10 lists today) — e.g. *2026-27 · 1st Year · Pre-Medical → English, Urdu, Islamiat, Biology, Chemistry, Physics*. Boys and Girls of the same program share it, and so do sections A and B, because their subjects are identical; a section's subjects are **derived** from its group. If one section ever needs a deviation, a `section_subject_overrides` table can be added later without touching anything else.

This list drives: which subjects a teacher can be assigned, which papers a student sits, what appears on the result card, and what the timetable may schedule.

### 7.4 Enrollment & promotion

- One `student_enrollments` row per student **per session**, pointing at a section. Class, division and program are *not* copied into it — they come from the section's group, so a rename can never desynchronise a student's record.
- Moving within a session (section change, or switching program, e.g. Pre-Engineering → ICS Physics) = update `section_id` on the current enrollment, audited.
- Moving to the next session = **a new row**. The old row is closed with status `PROMOTED`/`REPEATED`/`COMPLETED` and keeps pointing at the old section forever, so past attendance, marks and results stay exactly where they were.

### 7.5 Teacher assignments

One `teacher_assignments` row = *this teacher teaches this subject in this section*. The section supplies session, class, division and program, so the full chain **Teacher → Session → Class → Division → Program → Section → Subject** is represented with a single, non-duplicating row. A teacher can hold any number of rows (one subject in one section, or five subjects across ten sections). `sections.incharge_staff_id` additionally marks a section in-charge. Together these define **staff scope** for authorization.

### 7.6 Admin → Academic Management (built in Phase 3)

Left-hand nav group **Academics**, six screens:

| Screen | What the admin does |
|---|---|
| **Academic Sessions** | List / add / edit sessions (`2026-27`, dates), set the **current** session, close a session. Closing never deletes anything. |
| **Classes / Years** | List / add / edit / activate-deactivate. Fields: name (`1st Year`), alternate name (`11th Class`), **level** (1, 2, … — used by promotion to find "the next class"). |
| **Divisions** | List / add / edit / activate-deactivate: `Boys`, `Girls`, or anything the college adopts later. |
| **Programs / Groups** | List / add / edit / activate-deactivate: Pre-Medical, Pre-Engineering, ICS Physics, ICS Economics, FAIT, … |
| **Session Structure** | The main screen. A **matrix for the selected session**: rows = Class × Division, columns = Programs, each cell a checkbox = "this group exists". Ticking creates the `academic_group` + a default section `A`. Each cell expands to manage its **sections** (add `B`, rename, set in-charge, deactivate) and shows live student counts. A **"Copy structure from previous session"** button reproduces last year's 20 groups in one click. |
| **Subjects & Curriculum** | Two tabs: *Subjects* (the master list — add/edit/deactivate) and *Curriculum* (pick class + program → tick its subjects, reorder for result cards; "copy from another program" and "copy from previous session" helpers). |
| **Teacher Assignments** | Filter by session/class/division/program/section → assign a teacher to each subject of that section (subject list comes from the curriculum, so an impossible combination cannot be chosen). Also a per-teacher view: "all of Mr. Khan's sections and subjects". |

Guard rails: a class/division/program/subject in use by the **current** session cannot be deleted (only deactivated, with a warning naming what uses it); deactivating never alters history; every change is audited.

---

## 8. Database design

Full column-level design: **[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)**.

### 8.1 Entity map (35 tables)

| Area | Tables |
|---|---|
| Identity & access | `users`, `sessions`, `permissions`, `role_permissions`, `user_permissions` |
| Academic building blocks | `classes`, `divisions`, `programs`, `subjects`, `departments` |
| Academic structure per session | `academic_sessions`, `academic_groups`, `sections`, `curriculum_subjects` |
| People | `students`, `student_enrollments`, `staff`, `teacher_assignments` |
| Attendance | `attendance_sheets`, `attendance_entries` |
| Exams & results | `exam_types`, `exams`, `exam_subjects`, `marks`, `grade_scales`, `grade_bands`, `results` |
| Timetable | `timetable_slots` |
| Communication | `notices`, `notice_targets`, `events` |
| Documents | `document_types`, `documents` |
| System | `audit_logs`, `settings`, `code_sequences` |

### 8.2 Key relationships

```
users 1──0..1 students        users 1──0..1 staff

academic_sessions 1──* academic_groups *──1 classes / divisions / programs
academic_groups   1──* sections
academic_sessions 1──* curriculum_subjects *──1 classes / programs / subjects

students 1──* student_enrollments *──1 sections   (→ group → class, division, program, session)
staff    1──* teacher_assignments  *──1 sections + subjects
staff    1──* sections (as in-charge)

attendance_sheets (section+subject+date, unique) 1──* attendance_entries *──1 students
exams (per session) 1──* exam_subjects (per class+subject) 1──* marks *──1 students
exams 1──* results *──1 students   (results snapshot section + academic_group)
grade_scales 1──* grade_bands
timetable_slots *──1 sections / subjects / staff
notices 1──* notice_targets (ALL | STUDENTS | STAFF | CLASS | DIVISION | PROGRAM | GROUP | SECTION)
documents *──1 students | staff | notices | events
audit_logs *──0..1 users
```

Consistency is enforced by the database itself with composite foreign keys: a section can only belong to a group of the same session, an enrollment only to a section of its own session, and so on (schema doc §11).

### 8.3 Design principles applied

- **Session-scoped history:** enrollments, assignments, attendance, exams, results and curriculum all carry `academic_session_id`. Starting a new session creates new rows; nothing is overwritten.
- **Snapshots where history matters:** attendance entries and results copy class/section at the time of recording, so a later section change does not rewrite the past.
- **Configuration is data, not code:** exam types, grade scales, document types (required flag, allowed MIME types, max size) live in tables editable by Admin.
- **Soft delete for people, never hard delete of history:** students/staff get `deleted_at`; anything with attendance/marks cannot be physically removed.
- **Uniqueness enforced by the database:** one attendance sheet per section+subject+date; one mark per paper+student; one result per exam+student; one enrollment per student+session.
- **Indexes for the real queries:** student search, attendance by student/date, marks by paper, results ranking, missing-document lookups, audit by entity.
- **IDs:** UUID v7 primary keys (time-ordered, index-friendly) + human codes (`STU-0001`, `STF-0001`) generated from `code_sequences` inside a transaction.

---

## 9. Documents & Google Drive architecture

### 8.1 Division of responsibility

| Stored in PostgreSQL | Stored in Google Drive |
|---|---|
| `documents` metadata: owner, type, Drive file id, folder id, safe file name, original name, MIME, size, SHA-256, status, uploader, timestamps | The actual bytes: photos, CNIC/B-Form scans, Father's CNIC, previous results, matric roll-number slips, staff CNIC/CV, notice/event attachments, college documents |
| Small photo thumbnails (`≤ 10 KB` WebP) on `students`/`staff` for fast list rendering | — |

The browser **only ever sees `documents.id`** (a UUID). Drive file IDs, folder IDs and credentials never leave the server. This also makes the storage provider replaceable.

### 8.2 Storage provider abstraction

```ts
interface StorageProvider {
  ensureFolder(path: string[]): Promise<{ folderId: string }>
  upload(input: { folderId; fileName; mimeType; body: Readable | Buffer; size }): Promise<{ fileId; size }>
  download(fileId: string): Promise<{ stream: Readable; mimeType; size }>
  delete(fileId: string, mode: 'trash' | 'permanent'): Promise<void>
  healthCheck(): Promise<void>
}
```

Implementations: `GoogleDriveProvider` (production), `InMemoryStorageProvider` (tests), later `S3Provider`/`LocalDiskProvider` if ever needed.

### 8.3 Google authentication — two supported modes (needs your answer, Q1)

| Mode | When | How it works | Notes |
|---|---|---|---|
| **A. OAuth 2.0, server-side refresh token** *(default)* | College has a regular Gmail / any Google account | Admin clicks "Connect Google Drive" once → consent screen → app stores the **refresh token encrypted** (AES-256-GCM with `APP_ENCRYPTION_KEY`) in `settings`. Server exchanges it for access tokens as needed. Scope: `drive.file` (app can only see files it created — least privilege). | Free. Files owned by the college account. Root folder must be created *by the app* (because of `drive.file`). OAuth app must be set to "Production" so the token does not expire after 7 days. |
| **B. Service account + Shared Drive** | College has **Google Workspace** (Workspace for Education is free for eligible institutions) | Service-account JSON key in env; account is added as *Content manager* on a Shared Drive. | Most robust (no user token to expire; files owned by the organisation). Requires Workspace. |

Not viable: a service account uploading into a normal Gmail "My Drive" — Google blocks uploads that consume service-account storage since April 2025.

Both modes share the same `GoogleDriveProvider`; only the auth client differs (`GOOGLE_STORAGE_MODE=oauth | service_account`).

### 8.4 Folder structure — evaluated decision

Proposed by you: per-person folders with per-document-type sub-folders. Evaluation:

| Concern | Finding |
|---|---|
| Security | Folder layout has **no** security effect — the app never shares anything; access is decided by the database + server. |
| Organisation / searchability | A per-person folder is valuable for humans (auditors, backups) browsing Drive. Per-*type* sub-folders add 5 folders × N students (≈15,000 folders for 3,000 students) with no benefit because the file name already carries the type. |
| Performance | The app never lists folders; it opens files by ID. Folder creation is an API call: 1 per person (lazy, on first upload) instead of 6. |
| Scalability | Thousands of child folders under `Students/` is fine for Drive (limit 500k items). |
| Backup / maintainability | Simple, predictable paths; folder IDs cached in DB so we never search by name. |

**Decision:** one folder per person, no type sub-folders, self-describing file names:

```
Kabirian College/                       (root; ID in env / settings)
├── Students/
│   ├── STU-0001/
│   │   ├── STU-0001_PHOTO_20260828-1530.jpg
│   │   ├── STU-0001_CNIC-BFORM_20260828-1531.pdf
│   │   ├── STU-0001_FATHER-CNIC_20260828-1532.pdf
│   │   ├── STU-0001_PREVIOUS-RESULT_20260828-1533.pdf
│   │   └── STU-0001_MATRIC-ROLL-SLIP_20260828-1534.pdf
│   └── STU-0002/ …
├── Staff/
│   └── STF-0001/  STF-0001_PHOTO_….jpg · STF-0001_CNIC_….pdf · STF-0001_CV_….pdf
├── Notices/      (attachments, by year)
├── Events/       (images/attachments, by year)
└── College-Documents/
```

### 8.5 Upload pipeline (server)

1. `POST /api/v1/students/{id}/documents` (multipart) → `withAuth` → `authorize(ctx,'documents.upload')` + scope.
2. Check declared size ≤ `document_types.max_size_bytes`; read into memory/temp (cap enforced while reading).
3. **Sniff magic bytes** (`file-type`); must match an allowed MIME for that document type (JPEG/PNG/PDF initially). Reject mismatches and dangerous content (e.g. HTML disguised as image).
4. Compute SHA-256; generate safe name `STU-0001_<TYPE>_<timestamp>.<ext>` (original name kept in DB only).
5. Insert `documents` row with status `UPLOADING` (transaction 1).
6. `storage.ensureFolder(['Students','STU-0001'])` (cached in `students.drive_folder_id`) → `storage.upload(...)` (resumable for large files).
7. On success (transaction 2): row → `ACTIVE`; previous `ACTIVE` doc of the same type → `REPLACED` (`replaced_by_document_id`); old file moved to Drive trash (policy `DOCUMENT_REPLACE_POLICY=trash|keep`); photo → regenerate thumbnail; audit `document.uploaded`.
8. On Drive failure: row → `FAILED` (visible to admin, retryable), user gets a clear "Could not store the file in Google Drive" message; details logged.

### 8.6 Secure viewing / download

```
GET /api/v1/documents/{id}/content[?disposition=attachment]
 → session → load document + owner → authorize('documents.view') + scope
   (ADMIN: any; STAFF: own docs only; STUDENT: own docs only)
 → storage.download(fileId) → stream to client
   Content-Type from DB · Content-Disposition with safe name · Cache-Control: private, max-age=300 · ETag = checksum
```

No public links, no "anyone with the link" sharing, ever. Deleting = status `DELETED` + Drive trash (recoverable 30 days) + audit; permanent purge is an explicit admin action.

### 8.7 Document checklist

`document_types` (seeded, admin-editable):

| Key | Owner | Required |
|---|---|---|
| STUDENT_PHOTO, STUDENT_CNIC_BFORM, STUDENT_FATHER_CNIC, STUDENT_PREVIOUS_RESULT, STUDENT_MATRIC_ROLL_SLIP | Student | Yes |
| STAFF_PHOTO, STAFF_CNIC, STAFF_CV | Staff | Yes |

Status per (person, type): **Uploaded** (an `ACTIVE` doc exists) · **Needs replacement** (admin flagged it, reason stored) · **Missing** (nothing active). "Students missing Father's CNIC" is a single indexed anti-join query; the dashboard shows complete vs incomplete counts and a per-type breakdown.

---

## 10. PWA architecture

| Piece | Design |
|---|---|
| Manifest | `app/manifest.ts`: name "Kabirian College", short_name "Kabirian", `display: standalone`, `start_url: /`, theme/background colours from the design tokens, 192/512 px + maskable icons, shortcuts (Attendance, Timetable, Notices). |
| Icons | `public/icons/` generated from the college logo (placeholder until the official logo is supplied); `apple-touch-icon` + iOS meta tags. |
| Service worker | Serwist via `@serwist/turbopack` (`app/sw.ts`, served from `/serwist/sw.js`), registered by `PwaProvider`; "A new version is ready — Reload" prompt on update (no `skipWaiting`). |
| Caching strategy | `/_next/static/**` (hashed), icons, logo: CacheFirst (30 d, capped) with the stylesheet, icons and offline page precached · HTML navigations: **NetworkOnly** → precached offline page (amended from NetworkFirst in ADR-161: a cached page would outlive a sign-out) · **`/api/**`: NetworkOnly — never cached by the SW** (sensitive, per-user). Document content relies only on the browser's private HTTP cache. |
| Offline-capable | Installing/launching the app, the app shell, the offline page, static assets, data already on screen. |
| Online-required (clearly shown in UI) | Login, every read from the database, attendance/marks submission, uploads, downloads. A global offline banner appears; submit buttons disable with an explanation; requests fail fast with a friendly message. |
| Not in v1 | Offline queuing of attendance/marks (Background Sync) — deliberately deferred because of conflict/consistency risk. Push notifications — future. |
| Logout hygiene | In-memory query cache cleared; SW holds no user data, so nothing sensitive persists on shared devices. |

---

## 11. Project folder structure

```
kabirian-college/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                 # versioned SQL migrations (incl. hand-written partial indexes)
│   └── seed/                       # reference data (permissions, doc types…) + clearly-labelled DEV demo seed
├── public/
│   ├── icons/                      # PWA icons, apple-touch-icon
│   └── brand/                      # logo placeholder → official logo later
├── src/
│   ├── app/                        # Next.js App Router — routes only, kept thin
│   │   ├── (public)/login/         # login, change-password
│   │   ├── (portal)/admin/**       # admin portal routes
│   │   ├── (portal)/staff/**       # staff portal routes
│   │   ├── (portal)/student/**     # student portal routes
│   │   ├── api/v1/**               # route handlers (REST-style JSON API)
│   │   ├── ~offline/               # offline fallback page
│   │   ├── manifest.ts · sw.ts · layout.tsx · globals.css
│   ├── components/
│   │   ├── ui/                     # shadcn primitives: button, input, select, table, dialog, sheet, badge, alert, toast, skeleton…
│   │   ├── layout/                 # AppShell, Sidebar, Topbar, PageHeader, MobileNav
│   │   ├── data-table/             # reusable server-paginated table (sorting, filters, empty/error states)
│   │   ├── forms/                  # FormField wrappers, FileDropzone, DatePicker, SearchSelect
│   │   └── feedback/               # EmptyState, ErrorState, LoadingState, OfflineBanner
│   ├── features/                   # client-side feature modules (components, hooks, api client)
│   │   ├── auth/ · dashboard/ · students/ · staff/ · academics/ · attendance/
│   │   ├── exams/ · results/ · timetable/ · notices/ · events/ · documents/
│   │   ├── reports/ · users/ · audit/ · settings/
│   ├── server/                     # SERVER-ONLY (guarded by `import 'server-only'`)
│   │   ├── auth/                   # session.ts, password.ts, authorize.ts, permissions.ts, rate-limit.ts
│   │   ├── api/                    # withAuth(), errors.ts, pagination.ts, response.ts
│   │   ├── db/                     # prisma.ts (singleton client)
│   │   ├── services/               # one file per module: students.service.ts, attendance.service.ts …
│   │   ├── storage/                # StorageProvider, google-drive.provider.ts, in-memory.provider.ts
│   │   ├── documents/              # upload pipeline, validation, naming, thumbnails
│   │   ├── audit/                  # audit logger
│   │   ├── config/                 # env.ts (Zod-validated), constants.ts
│   │   └── logger.ts
│   ├── validation/                 # Zod schemas shared by client & server (per module)
│   ├── types/                      # shared DTOs / TS types
│   ├── lib/                        # isomorphic helpers: dates (Asia/Karachi), formatting, cn()
│   └── hooks/                      # shared React hooks
├── tests/
│   ├── unit/                       # pure functions: grading, percentages, validators, naming
│   ├── integration/                # services + API against a test database (authorization matrix lives here)
│   └── e2e/                        # Playwright: portals, responsive, PWA
├── scripts/                        # create-admin.ts, connect-google-drive.ts, export-backup.ts
├── docs/                           # DATABASE_SCHEMA.md, GOOGLE_DRIVE_SETUP.md, DEPLOYMENT.md, …
├── .env.example · .gitignore · Dockerfile · package.json · tsconfig.json · next.config.ts
├── PROJECT_PLAN.md · DECISIONS.md · README.md
```

---

## 12. Environment variables (`.env.example` — created in Phase 1)

```
# App
APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Karachi
APP_ENCRYPTION_KEY=            # 32 bytes base64 — encrypts stored Google refresh token
SESSION_MAX_AGE_DAYS=30
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...  # Neon (dev branch) or local PostgreSQL

# Google Drive
GOOGLE_STORAGE_MODE=oauth      # oauth | service_account
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/settings/google/callback
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=   # only for service_account mode
GOOGLE_DRIVE_ROOT_FOLDER_ID=          # set by the connect script

# Uploads
UPLOAD_MAX_SIZE_MB=10
UPLOAD_ALLOWED_MIME=image/jpeg,image/png,application/pdf
DOCUMENT_REPLACE_POLICY=trash  # trash | keep
```

Real `.env` is git-ignored; secrets only in the host's environment settings in production.

---

## 13. Error handling, validation, logging

- **Error classes:** `ValidationError(400)`, `AuthenticationError(401)`, `ForbiddenError(403)`, `NotFoundError(404)`, `ConflictError(409)`, `StorageError(502)`, `AppError(500)`. Route wrapper maps them to `{ error: { code, message, fields? } }`.
- **Users see:** actionable messages ("A sheet for this section, subject and date already exists — open it to make corrections"). **Users never see:** stack traces, SQL, Drive API payloads.
- **Server logs:** pino JSON with request id, user id, duration; automatic redaction of passwords, tokens, CNIC numbers.
- **Validation:** Zod schemas in `src/validation/*` used by react-hook-form (client) and route handlers (server). Domain rules (e.g. obtained ≤ max marks, section belongs to class, date inside session) enforced in services, with DB constraints as the last line of defence.
- **Pakistan-specific validators:** CNIC/B-Form `#####-#######-#`, phone `03##-#######` / `+92…`, session name `YYYY-YY`.

---

## 14. Testing strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | Grade calculation, percentages, ranking, validators, file naming, permission resolution |
| Integration | Vitest + Prisma against a test DB (Neon test branch or local) | Services & API handlers; **authorization matrix**: student A ↔ student B, staff vs unassigned section, unpublished results invisible, deactivated user rejected, permission overrides |
| Storage | `InMemoryStorageProvider` (`STORAGE_PROVIDER=memory`, Phase 19) | Upload/replace/delete flows in the harness without touching Drive; the real-Drive connection test on the Settings page |
| E2E | `tests/harness/run.mjs` (production build against in-memory PostgreSQL) + Playwright (`tests/e2e/`, Pixel 5 and desktop projects) | API and page checks per module (Phases 10–15); sign-in and portal boundary; one real flow per portal; responsive matrix (no page scrolls sideways; drawer vs sidebar); PWA manifest, service worker, offline banner and offline page; 5,000-student load timings. Lighthouse's PWA category no longer exists (ADR-161) |
| Manual | Checklists per phase | Real Google Drive connection, install on Android/iOS |

Tests are written *with* each phase, not only in Phase 16.

---

## 15. Performance & scalability

- Every list endpoint: server-side pagination (cursor or offset, max 100/page), sorting whitelist, indexed filters, `select` only needed columns.
- Attendance/marks entry screens load one section at a time (≤ ~100 rows).
- Dashboard KPIs use aggregate SQL (`count`, `avg`) with indexes; heavy ones (document completeness) can be cached in `settings` for a few minutes if needed.
- Photos in lists come from the DB thumbnail (~5–10 KB), never from Drive.
- Reports stream CSV; PDF generation server-side with limits.
- No N+1: services use Prisma `include`/joins consciously; query logging in dev.
- Search: `ILIKE` with indexes first; `pg_trgm` trigram index if student search becomes slow at scale.

---

## 16. Security checklist (tracked through the project)

- [x] Argon2id, DB sessions, HttpOnly/Secure cookies, sliding expiry, revocation — per device since Phase 14 (ADR-159)
- [x] Rate limiting + lockout on login; generic errors — and per-account limits on password change, uploads and exports (ADR-160)
- [x] `authorize()` + scope check in **every** service function; matrix tests — policy modules with both-sides tests, and the production harness per phase
- [x] Role-based DTO projection (staff never receive CNICs)
- [x] IDOR tests for every `/{id}` endpoint — cross-access checks in the production harness, extended each phase (Phase 14: audit and session routes)
- [x] Zod on every input; magic-byte sniffing on every upload; size limits
- [x] Drive IDs & credentials server-only; no public sharing; proxy downloads
- [x] Encrypted refresh token; env-only secrets; `.env` git-ignored — pre-commit secret scanning is still to add (Phase 17)
- [x] Security headers (CSP, HSTS, frame, referrer, permissions) — CSP with a nonce per request (ADR-157)
- [x] Audit log for all sensitive actions; audit visible to Admin only — viewer with redacted detail (ADR-158)
- [x] Dependency audit (`npm audit`) in CI; pinned versions — `scripts/audit-check.mjs` with a reviewed allowlist, GitHub Actions (ADR-160)
- [x] TLS to DB; DB encrypted at rest (Neon); least-privilege DB user — `scripts/db-least-privilege.sql`, applied by the college in Neon (ADR-163)
- [x] Backups: DB automated (PITR) + periodic export script; restore drill before go-live — `backup:export` / `backup:restore`, drilled by the harness on every push; one drill on a Neon branch is on the go-live checklist (ADR-164)
- [x] Logging redaction of PII — by key and by shape (national IDs)

---

## 17. Real-world scenarios → how the design handles them

| Situation | Handling |
|---|---|
| Student changes section mid-session (A → B) | Update `student_enrollments.section_id` (audited). Past attendance/marks keep the section they were recorded against. |
| Student changes program mid-session (Pre-Engineering → ICS Physics) | Same single update — point the enrollment at a section of the new group. Attendance/marks already taken stay attached to the old subjects; the new curriculum applies from now on. Admin sees a warning listing subjects that differ. |
| Student promoted to next class | Promotion wizard: close old enrollment (`PROMOTED`), create a new enrollment in the next session's group (same division + program, next `classes.level`) and section. Old data untouched. |
| Student repeats a year | New enrollment in the *same* class of the new session; old row closed as `REPEATED`. Both years remain separately visible. |
| Student leaves | Enrollment `LEFT` + `students.status = LEFT` + user deactivated (sessions revoked). Records and documents retained. |
| New academic session begins | Create session (`UPCOMING`) → "copy structure from previous session" creates the 20 groups + sections + curriculum → adjust (add/remove a program, add Section B) → run promotions → mark `ACTIVE` (previous → `CLOSED`, still readable). |
| College adds a new program or division (e.g. "Pre-Medical Evening", a third division) | Add a row in `programs` / `divisions`, then create the `academic_groups` that use it in the current or next session. No code change, no migration. |
| A program is discontinued | Deactivate it (`is_active = false`) so it disappears from new structures and forms; existing groups, students and history are untouched. |
| Teacher changes subjects or sections | End old assignments (`is_active=false, ended_at`), add new ones. Historical attendance/marks still show the original marker. |
| Teacher leaves | `employment_status=LEFT`, user deactivated, assignments ended, timetable slots flagged for reassignment. |
| Attendance correction | Edit entries in the sheet; requires `attendance.update` (own, before submission) or `attendance.update_submitted`; before/after stored in audit. |
| Marks correction after submission | Requires `marks.update_submitted`; if the result was published, admin must unpublish → correct → regenerate → republish; all audited. |
| Results published / re-published | `results.is_published` toggled; result rows keep a subject breakdown snapshot and `version`; students only ever query published rows. |
| Document replaced | New Drive file + new `documents` row; old row `REPLACED` (linked), old file trashed per policy; audit entry. |
| Document missing / incomplete files | Anti-join on `document_types` per person; filters "missing X" in student/staff lists; dashboard counts. |
| Historical results | Session-scoped; closing a session is a status change only. |
| Staff must not see unauthorised students | Scope check against `teacher_assignments` + limited DTO; enforced in services, tested. |
| Two teachers submit the same sheet at once | Unique constraint on (section, subject, date) inside a transaction → second gets a clear conflict message. |
| "Today" near midnight | All "today" logic uses `Asia/Karachi`; attendance dates are `DATE` columns, never timestamps. |

---

## 18. Development roadmap

Each phase ends with: verification, tests, `PROJECT_PLAN.md` progress update, `DECISIONS.md` update if needed, a "what was built / how to run / how to test / what remains" summary.

| # | Phase | Deliverables | Done when |
|---|---|---|---|
| 0 | **Discovery & architecture** | This plan, DECISIONS.md, schema doc | You confirm the open questions |
| 1 | **Project setup & design system** | Next.js + TS + Tailwind + shadcn; ESLint/Prettier/Husky; git init; Zod-validated env; Prisma connected to Neon; health endpoint; app shell (sidebar/topbar/mobile nav) for 3 portals; design tokens + logo placeholder; base components; manifest + icons (installable shell); README | `npm run dev` shows branded shell; `lint`, `typecheck`, `test` pass; DB connection verified |
| 2 | **Auth, users, permissions, audit** | Identity tables + migration; Argon2id; login/logout/forced change; sessions; rate limit/lockout; `withAuth`, `authorize`; permission seed; `create-admin` script; admin **User management** UI (create, activate/deactivate, reset password, role, overrides); audit logger + first entries; authorization test suite | Three demo users log into three portals; matrix tests pass |
| 3 | **Academic structure** | Building blocks (classes/years, divisions, programs, subjects, departments) with add/edit/activate; academic sessions + "current session" switch; **Session structure builder** (create the 20 groups from a matrix, add/rename/deactivate sections); **Curriculum** screen (subjects per class × program); "copy structure & curriculum from previous session"; reference seed for Kabirian's real classes, divisions and programs | Admin can build 2026-27 exactly: 2 classes × 2 divisions × 5 programs, sections, and each program's subject list |
| 4 | **Student management** | Student CRUD (multi-step form), enrollment into class → division → program → section, list w/ server pagination + search + filters (class, division, program, section, status), profile tabs, section/program transfer, promotion wizard, leave/deactivate, account creation, optional CSV import; student portal profile | Full student lifecycle works and is audited |
| 5 | **Staff management** | Staff CRUD, teacher assignments UI (pick section + subject from the curriculum), section in-charge, lists/filters, account creation, leave workflow; staff portal profile + "my assignments" | Assignments drive staff scope |
| 6 | **Google Drive & documents** | `StorageProvider`, Google auth (mode per Q1) + "Connect Drive" flow/script, folder bootstrap, upload/view/download/replace/delete, magic-byte validation, thumbnails, checklist & missing-document filters, document-type settings; own-documents views | Real file round-trips to Drive; checklist correct |
| 7 | **Attendance** | Staff marking flow, submit, history, corrections; admin view/edit/correct + reports; student attendance & %; dashboard widgets | Duplicate prevention + audit verified |
| 8 | **Exams & marks** | Exam types config, exams, papers (schedule, max/passing), staff marks grid (draft/submit), admin marks edit w/ permissions, locking; student exam schedule | Marks flow end-to-end |
| 9 | **Results** | Grade scales config, generation, class/student views, publish/unpublish, optional ranking, printable result card; student published-only view | Re-publish scenario passes |
| 10 | **Timetable** | Week-grid builder per section, clash detection (room/teacher/section), staff & student views, "today's classes" widgets | Conflicts rejected |
| 11 | **Notices & events** | CRUD, audience targets, schedule/expiry, attachments, events w/ image; portal feeds & widgets | Targeting verified per role |
| 12 | **Dashboards & KPIs** | Final admin KPIs w/ efficient aggregates; staff & student dashboards; quick actions | Loads < 1 s with seeded data |
| 13 | **Reports & exports** | Report centre (students, staff, attendance, exams, results, missing docs) with **class / division / program / group / section** filters and grouping — e.g. "Girls Pre-Medical 1st Year attendance", "FAIT result summary"; print CSS, PDF, CSV | Exports match on-screen data |
| 14 | **Audit UI & security hardening** | Audit viewer/filters, CSP & headers, active-sessions UI, rate limits review, dependency audit, IDOR sweep, PII redaction check | Security checklist §16 complete |
| 15 | **PWA & offline** | Serwist SW, caching rules, offline page, update prompt, install prompt UI, iOS metadata, Lighthouse PWA pass, offline banner | Installs on Android & iOS; audit passes |
| 16 | **Testing & QA** | Coverage gaps, E2E per portal, responsive matrix, 5k-student dev-seed load check, bug-fix pass | Green suite; no P1 bugs |
| 17 | **Deployment & go-live** | Dockerfile (standalone), host + domain + HTTPS, Neon prod, prod Google credentials, backups + restore drill, monitoring, real data import, admin onboarding, handover docs | Live with real data |

**Reordering vs. your draft:** academics (3) moved before students (4) because enrollments need classes/sections; Google Drive/documents (6) moved up because it is the riskiest integration and profiles need photos; audit foundation moved into Phase 2 so every later module logs from day one; dashboards get a dedicated polish phase (12) once real data exists.

---

## 19. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Google account access lost (password/2FA issue, token revoked) → uploads/downloads stop | High | Prefer Workspace + Shared Drive if available; otherwise a dedicated college Google account with 2FA + recovery options; health check + admin alert; "Reconnect Drive" flow; nightly DB backup + periodic Drive export script |
| Google API limits/latency; Drive is not a CDN | Medium | Thumbnails in DB; private browser caching; retries with backoff; uploads are async-friendly |
| Hosting body-size limits (Vercel 4.5 MB) | Low | Uploads capped at 4 MB on Vercel (`UPLOAD_MAX_SIZE_MB`, PDF types); the Docker image lifts the cap if it ever matters (ADR-163) |
| Custom auth maintained by a beginner | High if wrong | Small, documented, tested code following the well-known Lucia patterns; security review in Phase 14; `better-auth` is the fallback library |
| Sensitive PII (CNICs) leakage | High | Role DTOs, IDOR tests, audit, redaction, TLS, encrypted-at-rest DB; application-level field encryption considered post-v1 |
| Timezone bugs (attendance dated wrong day) | Medium | `DATE` columns; all "today" logic in `Asia/Karachi`; tests around midnight |
| Ecosystem churn (Next 16, Prisma 7, Tailwind 4) | Medium | Pin versions; upgrade deliberately, not automatically |
| Scope creep from the future-features list | Medium | Roadmap discipline; extensibility via data-driven config, not speculative code |
| No Docker / local DB on dev machine | Low | Neon dev branch; document local-Postgres alternative |
| Data migration of existing students (spreadsheets) | Medium | CSV import with validation report (Phase 4/17) |
| iOS PWA limitations (storage eviction, no install banner) | Low | Manual "Add to Home Screen" guide; nothing critical stored on device |
| Single admin account compromise | High | Strong password policy, lockout, audit; 2FA (TOTP) planned post-v1 |

---

## 20. Assumptions (defaults I will use unless you say otherwise)

1. English UI only in v1; structure allows Urdu/i18n later.
2. Time zone `Asia/Karachi`; dates shown as `DD-MM-YYYY`.
3. Academic structure (confirmed by you): classes **1st Year (11th)** and **2nd Year (12th)**; divisions **Boys**, **Girls**; programs **Pre-Medical, Pre-Engineering, ICS Physics, ICS Economics, FAIT** → 20 groups per session, each starting with one section **A**. All of it is admin-managed data, never hard-coded. Subjects are defined per class × program (§7.3).
4. Attendance is taken **per subject period** by the subject teacher (per your spec); a "once per day" mode can be added later.
5. Attendance % = Present ÷ (Present + Absent + Leave); whether Leave counts as present is a setting (default: no).
6. Pass rule = obtained ≥ passing marks in **every** subject; overall grade from a configurable scale seeded with the common Pakistani intermediate bands (A+ 80–100, A 70–79, B 60–69, C 50–59, D 40–49, E 33–39, F <33). Ranking/position is off by default (setting).
7. Multiple admins are supported; one "system owner" admin is protected from deactivation.
8. Student and staff codes: `STU-0001` / `STF-0001` (zero-padded, configurable prefix/padding).
9. Initial allowed uploads: JPG/JPEG, PNG, PDF; 2 MB for photos, 10 MB for documents (configurable per document type).
10. Development seed data (clearly labelled demo students/staff) will be created for testing and never run against production; production gets only reference data + the first admin.
11. Package manager: npm.
12. Hosting decision deferred to Phase 17; architecture assumes a long-running Node server.

---

## 21. Open questions — need your decision before Phase 1

| # | Question | Options | My recommendation |
|---|---|---|---|
| **Q1** | Which Google account will hold the files? | (A) Regular Gmail / any Google account → OAuth refresh-token mode · (B) Google Workspace (incl. free Workspace for Education) → service account + Shared Drive | (B) if the college has/can get Workspace; otherwise (A) with a dedicated college account + 2FA |
| **Q2** | Attendance model | (A) Per subject period, marked by subject teacher · (B) Once per day per section (class in-charge) · (C) Both | (A), as specified — schema is built to allow (B) later |
| **Q3** | Login identifier | (A) Username = STU/STF code (email optional) · (B) Email only | (A) |
| **Q4** | ~~Class structure~~ **Answered 2026-08-28** — 2 classes × 2 divisions × 5 programs = 20 groups (§7.1). Remaining detail: **which subjects does each program study?** (e.g. Pre-Medical: English, Urdu, Islamiat, Pak Studies, Biology, Chemistry, Physics) — and does every group currently have exactly one section **A**? | Send the subject list per program when convenient; otherwise I seed a sensible draft in Phase 3 and you correct it in the Curriculum screen in minutes |
| **Q5** | Existing data | Do you have current students/staff in Excel/Google Sheets that must be imported? | If yes, CSV import moves into Phase 4 |
| **Q6** | Database for development | (A) Neon free tier (no install, needs internet) · (B) Install PostgreSQL locally on Windows | (A) |

Everything else in §20 will proceed on the stated defaults.

---

## 22. Progress tracker

**Current phase:** 28 — complete, apart from the Neon migration, which is waiting for the go-ahead. The original roadmap (§20) and all sixteen of the college's own requests (§23A) were finished at Phase 26; this and anything after it are asked for as the college uses the system.

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery & architecture | ✅ Done (2026-08-28) | Docs created; **rev. 2** added Kabirian's real academic structure |
| 1 Setup, design system, auth & Academic Management | ✅ Done (2026-08-29) | Phase 1 absorbed the original Phases 1–3 at the college's request. See §22.1 |
| 2 User accounts & permission management | ✅ Done (2026-08-29) | Admin User Management, account lifecycle, password resets, permission overrides. See §22.3 |
| 3 Admin dashboard | ✅ Done (2026-08-29) | Live statistics, academic overview, quick actions, recent activity. See §22.5 |
| 4 Student management | ✅ Done (2026-08-30) | Records, enrollment, transfer, promotion, account linking. See §22.7 |
| 5 Staff management | ✅ Done (2026-08-31) | Staff records, teacher assignments, section in-charge, staff portal, scoped student access. See §22.10 |
| 6 Google Drive & documents | ✅ Done (2026-08-30) | OAuth connection, encrypted token, document model, upload/view/replace, layered access. See §22.14 |
| 7 Attendance | ✅ Done (2026-08-30) | Database, service/API, Admin, Staff and Student screens, and reports. Export and alerts are deliberately left for later. See §22.20–§22.25 |
| 8 Exams & results | ✅ Done (2026-08-31) | Architecture, database and calculation, exam and date-sheet screens, marks entry, result generation and publication, and the student and staff result portals. Result cards and exports are deliberately left for later. See §22.26–§22.31 |
| 9 Results | ✅ Done (2026-08-31) | Generation, review, publication, portals and the printable A4 result card. See §22.29–§22.33 |
| 10 Timetable | ✅ Done (2026-09-07) | Fixed period grid in code, master timetable builder, teacher week and today's classes, three clash rules backed by partial unique indexes. No student timetable, by decision. See §22.34 |
| 11 Notices & events | ✅ Done (2026-09-08) | Targets as rows, publish windows, attachments through Drive, office screens, portal feeds and dashboard cards. Migration live on Neon. See §22.35–§22.38 |
| 12 Dashboards & KPIs | ✅ Done (2026-09-08) | Operations figures for the office, today's registers and open mark sheets for teachers, attendance / results / next paper for students; quick actions for every module. See §22.40 |
| 13 Reports & exports | ✅ Done (2026-09-08) | Report centre with structure filters and grouping; print via the browser; CSV from the same query. See §22.41 |
| 14 Audit UI & security | ✅ Done (2026-09-08) | Audit viewer with redacted detail and CSV; CSP with a nonce per request; signed-in devices; account rate limits; log redaction by shape; CI + audit gate. See §22.42 |
| 15 PWA & offline | ✅ Done (2026-09-08) | Serwist worker (build files only), offline page, offline banner and guarded submits, update prompt, install entry with iOS steps, shortcuts via `/go/*`. See §22.43 |
| 16 Testing & QA | ✅ Done (2026-09-08) | Harness in the repo, Playwright on phone + desktop, responsive matrix, 5k-student load check, coverage gaps closed, CI runs all of it. See §22.44 |
| 17 Deployment & go-live | ✅ Done (2026-09-08) | Vercel + Docker guides, least-privilege role, backups + restore drill, CSV import, handover guide, monitoring, go-live checklist. See §22.45 |
| 18 Attendance bands & teacher corrections | ✅ Done (2026-09-08) | Colour bands (Phase 10); teachers correct submitted registers within an office-set window, audited; Attendance rules on Settings. See §22.46 |
| 19 Profile photos | ✅ Done (2026-09-08) | Thumbnails from the photo document, served under the document rule, faces on lists, pages, registers and the menu; in-memory storage for the harness. See §22.47 |
| 20 Homework | ✅ Done (2026-09-08) | Teachers set homework where assigned, with files; students read their section's; the office sees all. Migration 11 live on Neon. See §22.48 |
| 21 Marks deadline & corrections | ✅ Done (2026-09-08) | Deadline per exam; teachers correct their own submitted sheets until it passes; the office reopens one paper with a reason. Migration 12 live on Neon. See §22.49 |
| 22 | ✅ Done (2026-09-08) | Staff attendance taken by the office; live on Neon (thirteen migrations, zero drift) |
| 23 | ✅ Done (2026-09-09) | Complaints; live on Neon (fourteen migrations, zero drift) |
| 24 | ✅ Done (2026-09-09) | A staff member who is also an admin; live on Neon (fifteen migrations, zero drift) |
| 25 | ✅ Done (2026-09-10) | Fees; live on Neon (sixteen migrations, zero drift) |
| 26 | ✅ Done (2026-09-10) | Finance and permanent deletion; live on Neon (seventeen migrations, zero drift) |
| 27 | ✅ Done (2026-09-11) | Notifications, complaint thread that refreshes itself, printable fee voucher, Payments first on the dashboard; live on Neon (eighteen migrations, zero drift) |
| 28 | ✅ Done (2026-09-11) | Annual fee by head, set at admission with documents and a staff salary; live on Neon (nineteen migrations, zero drift) |
| 29 | ✅ Done (2026-09-11) | A printable handbook covering the whole system, and the college's real logo throughout |
| 30 | ✅ Done (2026-09-10) | The 188 enrolled students imported from the old system with their logins, and their fee ledger reconciled to the rupee (111 plans, 111 vouchers, 34 payments) |
| 31 | ✅ Done (2026-09-10) | A lesson covers several sections — combined classes, elective splits and one teacher taking a subject across a year (ADR-181) |
| 32 | ✅ Done (2026-09-10) | No break; the office sets its own period times, and a day can be copied on to other days (ADR-182) |
| 33 | ✅ Done (2026-09-11) | Four changes the college asked for: an optional exam time (ADR-183), one temporary password (ADR-184), the register taken by the first period's teacher (ADR-185), and every student and staff detail correctable by the office (ADR-186) |

**Live database:** the college's Neon PostgreSQL instance is connected and holds the real academic structure (2026-27, 20 groups, 20 sections). All **ten** migrations are applied to it, along with the reference data (12 designations, 10 departments, **8 document types**, and the confirmed **grading scale**).

### 22.1 What Phase 1 delivered

**Foundation**
- Next.js 16 + React 19 + TypeScript (strict) project, ESLint + Prettier, npm scripts, `.env.example`.
- Zod-validated environment configuration that fails loudly at boot with a readable message.
- PostgreSQL via Prisma 7 (driver adapter, configurable pool size), one initial migration, `check:db` diagnostic script.
- Structured JSON logger with automatic redaction of passwords, tokens and CNIC numbers.
- PWA manifest + generated icons (installable). Service worker deferred to Phase 15.

**Design system** — brand tokens (light + dark), Button, Input/Textarea/Select/Checkbox, Field, Card, Badge, Table, Dialog, Alert, EmptyState, Skeleton; responsive app shell with desktop sidebar, mobile drawer and user menu; logo placeholder.

**Authentication & authorization**
- Argon2id password hashing; database-backed sessions with SHA-256-hashed tokens in an HttpOnly cookie; sliding expiry; instant revocation.
- Login rate limiting (per IP and per username) plus database-backed account lockout.
- Identical error text for unknown username and wrong password; a dummy hash verification keeps response times similar.
- Forced password change on first sign-in; changing a password signs out all other devices.
- CSRF defence: `SameSite=Lax` cookie plus an Origin check on every state-changing request.
- 46-permission catalogue with role defaults and per-user GRANT/REVOKE overrides.
- Server-side portal guards for ADMIN / STAFF / STUDENT.

**Academic Management (the dynamic structure)**
- Academic Sessions: CRUD plus "make current" (one current session enforced by a partial unique index).
- Classes / Years, Divisions, Programs, Subjects: full CRUD with activate/deactivate.
- Session Structure: a Class × Division × Program matrix, per-group section management, "create all combinations", and "copy structure from another session".
- Curriculum: subjects per Class × Program, so different programs genuinely have different subject lists.
- Record safety: deleting anything that is referenced is refused with an explanation; deactivation is offered instead and preserves all history.
- Audit logging on every create, update, activate, deactivate and delete, with before/after snapshots.

**Data** — reference seed (46 permissions, 2 classes, 2 divisions, 5 programs, 14 subjects, settings, code sequences), structure seed (session + 20 groups + 20 sections), `create-admin` script, and a clearly-labelled development-only demo seed that refuses to run against production or real data.

**Tests** — 51 unit tests (password policy, permission resolution, academic validation, record-safety logic). `lint`, `typecheck`, `build` and `test` all pass.

### 22.2 Verified working (2026-08-29)

Verified against a real PostgreSQL engine and a running server, not by inspection:

| Check | Result |
|---|---|
| Migration applies to a real Postgres engine | ✅ 21 tables |
| Database rejects a section from another session, duplicate groups, duplicate roll numbers, two current sessions, case-variant usernames | ✅ 22/22 constraint tests |
| `migrate deploy` → `seed:reference` → `seed:structure` → `create-admin` | ✅ end to end |
| The 20 groups match the college's real structure | ✅ |
| Login, wrong password, unknown user, CSRF block, forced password change | ✅ |
| **Creating program "I.Com" through the API, then using it in the structure — no code change** | ✅ |
| Duplicate program name/code rejected with a field-level message | ✅ |
| Deleting an in-use program refused; deactivation keeps history | ✅ |
| Student cannot reach `/admin`, `/staff`, or any academics API | ✅ 307 / 403 |
| Staff can read academics but not manage them | ✅ |
| Multiple sections per program; duplicate section name rejected | ✅ |
| Pre-Medical and ICS Physics hold different subject lists | ✅ |
| "Copy structure to next session" — 21 groups, 22 sections, 10 curricula; re-running changes nothing | ✅ |
| Audit log captures logins, failed logins, and before/after for every change | ✅ |

**Remaining work:** Phases 6–17.

### 22.10 What Phase 5 delivered

Staff records, teacher assignments, section in-charge, and the scoped staff view of students — the piece Phase 4 deliberately deferred.

**Admin → Staff**
- List with server-side search (name, staff ID, phone, email), filters by department, designation, staff type and account status, sortable columns, pagination and status tabs.
- Add staff: employment, personal, contact and professional details, optionally with a portal login created in the same transaction. The Staff ID (`STF-0001`) comes from the shared counter.
- Profile: employment, personal and contact information; active and past teaching assignments; active and past in-charge roles; a plain statement of exactly which sections the person can see; and (from Phase 6) the document checklist.
- Employment lifecycle: Active, On leave, Inactive, Resigned, Retired, Terminated. Anything beyond "still working here" closes their assignments and in-charge roles, which removes their access — while keeping every row.

**Reference data** — Designations and Departments are now managed lists under Academic Management, reusing the same screen as Classes and Programs. Adding "Senior Lecturer" makes it selectable immediately.

**Teacher assignments** — Teacher → Session → Class → Division → Program → Section → Subject, through cascading dropdowns that only offer combinations that exist. Validated on the server: the staff member must exist, be active and be teaching staff; the section must belong to the chosen class, division, program and session; and **the subject must be in that program's curriculum**. Closing an assignment keeps the row.

**Section in-charge** — a record with history, not a column. One active in-charge per section, enforced by a partial unique index; appointing a replacement closes the previous one, and both stay on record.

**Staff Portal** — Dashboard (real figures from their own assignments), My Assignments (grouped by session), My Students (scoped), My Profile.

**Scoped student access** — the security core, described in §22.11.

**Audit** — `staff.created/updated/status_changed/account_linked/account_unlinked`, `assignment.created/closed`, `incharge.assigned/changed/removed`, and the designation/department actions, all readable on the dashboard.

### 22.11 The scoped teacher view

Phase 4 made Student Management administrator-only because staff hold `students.view` and would otherwise have seen every student's full record. Phase 5 replaces that with the intended design.

**Scope** — one function, `getScopedSectionIds`, decides everything: a teacher may see a section only if they hold an ACTIVE teaching assignment in it, or are its ACTIVE in-charge. Being staff grants nothing. A staff login not linked to a staff record sees nothing at all. Asking for another section returns **403**, not an empty list, so the attempt is visible in the logs.

**Fields** — the teacher receives eleven fields: student id and code, name, father's name, roll number, class, division, program, section id and name, and status. CNIC, father's CNIC, address, phone, guardian details, date of birth, admission number and notes are **never selected from the database** by this service, so they cannot leak through it.

Verified with three students in three different sections and one teacher assigned to one of them:

| The teacher asked for | Result |
|---|---|
| Their own students | 1 of 3 — only their section |
| The Girls / Pre-Medical section directly | 403 |
| The Boys / Pre-Engineering section directly | 403 |
| `GET /api/v1/students` (admin API) | 403 |
| `GET /api/v1/staff` (admin API) | 403 |
| `/admin/students`, `/admin/staff` | 307 to their own portal |
| Sensitive-field scan of all four staff-portal endpoints | clean |

### 22.12 The Phase 5 migration

`20260831000000_staff_management`, five changes:

1. **`designations` table**, and `staff.designation` (free text) becomes `staff.designation_id`. Existing values are copied into the new table first, so no record loses its job title.
2. **Employment statuses** gain Inactive, Resigned, Retired, Terminated.
3. **Staff types** gain Administrative and Support. `NON_TEACHING` stays defined but is never offered — PostgreSQL cannot drop an enum value, and rewriting rows would need a second migration for a value only demo data uses.
4. **`section_incharges` table** replaces `sections.incharge_staff_id`. A column overwrites; a table keeps history, and a partial unique index enforces one active in-charge per section. Any existing in-charge is carried across.
5. **Teacher assignment uniqueness** becomes a partial index on active rows. The old constraint was permanent, so a teacher could never resume a subject they had once taught.

Verified against a database that already contained staff, an in-charge and an assignment: all three survived with their data intact.

### 22.13 Phase 5 verification (2026-08-31)

| Check | Result |
|---|---|
| Migration applies to a clean database, and to one that already has staff | ✅ |
| Existing designations, in-charge and assignment preserved by the migration | ✅ |
| New statuses and staff types accepted; invented ones rejected | ✅ |
| Only one active in-charge per section; replacing keeps both rows | ✅ |
| Duplicate active assignment rejected; the same teacher may teach another subject, another teacher the same subject | ✅ |
| A closed assignment can be recreated later, and both rows remain | ✅ |
| A designation in use cannot be deleted | ✅ |
| 22/22 database constraint checks | ✅ |
| Staff created with `STF-0001`, designation and department from reference data | ✅ |
| Portal account created and linked in the same transaction | ✅ |
| Subject outside the program's curriculum rejected, naming the curriculum | ✅ |
| Section not matching the chosen class/division/program rejected | ✅ |
| Non-teaching staff refused a subject assignment | ✅ |
| **Scoped access: 1 of 3 students; other sections 403** | ✅ |
| **Teacher payload contains no CNIC, address, phone or guardian data** | ✅ |
| Admin still sees the full record for the same student | ✅ |
| Students blocked from the staff portal; admins too (it is the teacher's own view) | ✅ |
| Resigning a teacher closes assignments and empties their scope immediately | ✅ |
| A resigned teacher cannot be given new assignments | ✅ |
| Reinstating does not silently restore closed assignments | ✅ |
| **New program I.Com → offered in the assignment form → teacher assigned to it** | ✅ no code change |
| All four staff-portal pages render | ✅ |
| `typecheck`, `lint`, `build` clean; **213 tests pass** (171 existing + 42 new) | ✅ |

One improvement came out of testing: a duplicate student CNIC produced a generic conflict message because the index name was not in the message map. It now names the field.

### 22.14 What Phase 6 delivered

Google Drive as the college's document store, with the database as the record of what exists.

**Settings → Google Drive** — an administrator connects the college's Google account once. Google's own sign-in page handles the password; the app never sees it. The screen shows which account is connected, when, the permission granted, a link to the college folder, and a **Test connection** button that asks Google directly and reports the account and remaining storage. **Disconnect** makes the app forget its token and deletes nothing.

**The connection** — only the `drive.file` scope is requested, so the app can see only the files it created and nothing else in that Google account. The refresh token is encrypted with AES-256-GCM before it is stored, and there is no code path that returns it, logs it, or renders it. Access tokens are obtained automatically and cached in the process.

**Folders** — created on connection and reused thereafter:

```
Kabirian College/
  Students/
    STU-0001 Ali Raza/
  Staff/
    STF-0001 Sara Khan/
```

Each person's folder id is stored on their row, so after the first upload no Drive search happens at all.

**The document checklist** — eight starting types (5 student, 3 staff), each a database row with its own label, allowed file types, size limit, required flag and sensitivity flag. Adding "Domicile Certificate" is data entry, not a code change. Every profile shows what is on file and what is missing.

**Uploading** — validated against the file's own bytes, not the browser's claim; sized against that type's own limit; stored under a generated name. Uploading over an existing document replaces it: the old row becomes `REPLACED`, stays readable as history, and its file goes to the Drive trash.

**Viewing** — files stream through the application, which re-checks authorisation on every request. No Drive link is ever shown, nothing is ever shared, and a copied URL does not work for anyone else.

**Audit** — `storage.connected`, `storage.disconnected`, `storage.folders_created`, `document.uploaded`, `document.replaced`, `document.deleted`. No entry contains a token, a client secret, a Drive id or any file content.

### 22.15 Who can see which document

| | Photograph | CNIC, B-Form, result card, CV |
|---|---|---|
| Administrator | ✅ | ✅ (needs `documents.view_sensitive`) |
| Teacher — student in their own sections | ✅ | ❌ |
| Teacher — any other student | ❌ | ❌ |
| Teacher — another staff member's file | ❌ | ❌ |
| The student or staff member themselves | ✅ | ✅ |

Upload, replace and delete require the **ADMIN role** as well as the permission, so a student cannot replace their own CNIC scan and a teacher cannot alter a student's file.

The rule lives in one pure function (`src/server/documents/access.ts`) with no database access, so it is unit-tested from both sides — the case it must allow and the case it must refuse. "Which students can a teacher see" is answered by the same `getScopedSectionIds` used since Phase 5, not a second copy that could drift.

### 22.16 The Phase 6 migration

`20260901000000_documents`, additive only — no existing column or row is touched:

1. **`document_types`** — the configurable checklist, seeded with 8 types.
2. **`documents`** — one row per file: owner, type, storage id, generated and original filenames, verified MIME type, size, SHA-256 checksum, status, uploader, timestamps.
3. **Two enums** — `document_owner` (with `NOTICE`, `EVENT`, `COLLEGE` defined ahead of Phase 9) and `document_status`.
4. **A CHECK constraint** — exactly one owner column set, so "whose document is this?" always has one answer.
5. **Two partial unique indexes** — at most one *current* document per person per type; replaced and deleted rows are history and unlimited.

### 22.17 Phase 6 verification (2026-08-30)

**Database — 13/13**, against every migration applied in order to a throwaway PostgreSQL:

| Check | Result |
|---|---|
| All five migrations apply cleanly in order | ✅ |
| A second ACTIVE photo for the same student is refused | ✅ |
| A different type for the same student is accepted | ✅ |
| REPLACED copies alongside the active one are unlimited | ✅ |
| Once the old photo is REPLACED, a new one is accepted | ✅ |
| A document owned by both a student and a staff member is refused | ✅ |
| A document owned by nobody is refused | ✅ |
| A second ACTIVE staff photo is refused | ✅ |
| Reusing a Drive file id is refused | ✅ |
| An unknown document type is refused | ✅ |
| Deleting a student removes their document rows | ✅ |

**Running application — 36/38**, against a throwaway database:

| Check | Result |
|---|---|
| Anonymous, teacher and student are all refused the Drive settings | ✅ 401 / 403 / 403 |
| An administrator reads them; the response carries no secret | ✅ |
| Connect redirects to Google with `drive.file`, `access_type=offline`, `prompt=consent` | ✅ |
| The client secret is not in the URL | ✅ |
| The state is a random value, also set as an HttpOnly cookie | ✅ |
| A teacher clicking Connect is refused, not sent to Google | ✅ |
| A callback with a state we never issued is refused, in plain English | ✅ |
| Administrator sees all 5 student types; photo not sensitive, CNIC sensitive | ✅ |
| No Drive id or folder id appears anywhere in the API responses | ✅ |
| **A teacher may open the photograph of a student they teach** | ✅ |
| **A teacher may NOT open that student's identity documents** | ✅ |
| A teacher is refused a student they do not teach | ✅ 403 |
| A student sees their own checklist, including their own sensitive documents | ✅ |
| A student cannot see another student's checklist | ✅ 403 |
| A student cannot read a staff checklist | ✅ 403 |
| A staff member sees their own checklist in full | ✅ |
| Neither a student nor a teacher can upload | ✅ 403 |
| An HTML file renamed `photo.jpg` is refused before Drive is touched | ✅ 400 |
| A 3 MB photograph is refused against the 2 MB per-type limit | ✅ 400 |
| A PDF is refused for a type that only takes images | ✅ 400 |
| A valid upload with Drive unconnected fails clearly, not with a crash | ✅ 503 |
| An unknown document id is 404; anonymous content access is 401 | ✅ |
| The Settings page renders for an administrator, with no secret in the HTML | ✅ |
| `typecheck`, `lint`, `build` clean; **256 tests pass** (213 existing + 43 new) | ✅ |

Two checks could not be completed on the throwaway harness, which serves only one database connection and therefore cannot render server-side pages; both were confirmed separately against the real database, where `/admin/settings` returns 200 with the expected content and no secrets.

**Two defects were found by this run and fixed:** an upload attempted before Drive was connected returned `502` (a gateway error) instead of `503` with an actionable message; and the admin-area guard existed as three separate private copies, which is how such rules drift apart — it now lives once in `service-utils.ts`.

### 22.18 Connecting Google Drive

Connecting requires a browser, because an administrator has to sign in to Google and approve the request. **This was done on 2026-08-30**: the college account `kabiriancollege@gmail.com` is connected, the `Kabirian College/Students/` and `/Staff/` folders exist, and a live **Test connection** returns 0.01 GB used of 16 GB.

While the OAuth app stays in **Testing** in Google Cloud, Google expires the connection after seven days; the app says so plainly and an administrator clicks **Reconnect** in Settings. Setting the publishing status to **In production** removes that limit and, because `drive.file` is a non-sensitive scope, does not normally require Google's verification review.

### 22.19 A defect found outside Phase 6, since fixed

The six **Academic Management** screens built in Phases 1 and 5 (Classes, Divisions, Programs, Subjects, Designations, Departments) returned **HTTP 500 in a production build**. Each passed `columns[].render`, `labelOf` and `toFormValues` — ordinary JavaScript functions — from a server component into the `'use client'` `ResourceManager`. Props crossing that boundary must be serialisable, and a function is not.

It went unnoticed for five phases because `next dev` tolerates it and every earlier phase was verified with `next dev`. Phase 6 was the first verified against `npm run build && npm run start`.

**Fixed on 2026-08-30** (ADR-077), before Phase 7. Each screen gained a thin `'use client'` wrapper that owns its own columns and form configuration and receives only `items`. The page stays a server component and keeps the access check and the database read. `ResourceManager`, every API route, every service, every validation schema and every audit call are unchanged, and no database change was needed.

Verified against a clean production build:

| Check | Result |
|---|---|
| All six screens return 200 with their real rows (2 classes, 2 divisions, 5 programs, 14 subjects, 12 designations, 10 departments) | ✅ |
| Create, rename, deactivate and delete all work, each with its audit entry | ✅ |
| A signed-out visitor is redirected to the login page | ✅ |
| A signed-in staff user is redirected to their own portal | ✅ |
| That staff user is refused every academic write API, with valid payloads | ✅ 403 |
| Nothing was changed by those refused attempts | ✅ |
| Dashboard, Students, Staff, staff profile, Users, Settings, Sessions, Structure, Curriculum and all four Staff Portal pages | ✅ 200 |
| Google Drive still connected; folders present; live Test connection succeeds | ✅ |
| `typecheck`, `lint`, `build` clean; **256 tests pass** | ✅ |

**Process change:** phases are now signed off against the **production build**, not `next dev`. This class of defect is invisible under the dev server.

### 22.20 Phase 7, database stage (2026-08-30)

The attendance tables, and nothing else — no service, no API, no screen. Approved architecture is recorded in ADR-078 to ADR-082.

**`attendance_sheets`** — one class meeting: section, date, period, subject, who marked it, and whether it is a draft, submitted or cancelled. `subject_id` is **nullable**, and the NULL means the section in-charge's daily roll-call rather than a subject lesson.

**`attendance_entries`** — one student at that meeting: status and an optional remark, kept deliberately lean. It points at the *person* and reaches section and subject through its sheet, which is what keeps history honest: a student who transfers in March keeps their January attendance attached to the section they were actually sitting in, with nothing to rewrite.

**Statuses** — `PRESENT, ABSENT, LATE, LEAVE` and `DRAFT, SUBMITTED, CANCELLED`. LATE counts as present; LEAVE lowers the percentage unless the existing `attendance.leave_counts_as_present` setting says otherwise.

**Rules the database enforces, not the code:**

| Rule | How |
|---|---|
| One register per section, subject, date and period | `UNIQUE … NULLS NOT DISTINCT` — hand-written, because Prisma cannot express it |
| One entry per student per register | `UNIQUE (sheet_id, student_id)` |
| A sheet cannot mix a section with the wrong session | composite FK `(section_id, academic_session_id)` |
| An entry's session cannot drift from its sheet | composite FK `(sheet_id, academic_session_id)` |
| A student, subject or teacher with attendance cannot be deleted | `ON DELETE RESTRICT` |

**A timezone helper** — `src/server/time/college-date.ts`. `APP_TIMEZONE` had never been used, because until now every date was typed in by a person. Attendance is the first feature where the server decides the date, and a UTC host disagrees with Pakistan after 19:00 UTC (ADR-082).

**Verification**

| Check | Result |
|---|---|
| Migration is additive only — no ALTER, DROP, UPDATE or DELETE on existing tables | ✅ |
| All 6 migrations apply in order to a throwaway PostgreSQL | ✅ |
| Every existing table identical before and after on the live database | ✅ 20/20 |
| No attendance data seeded | ✅ 0 rows |
| `NULLS NOT DISTINCT` present on the live database; Prisma reports no drift | ✅ |
| Duplicate daily register refused — with a negative control proving a plain index would allow it | ✅ |
| **43 new tests** (28 schema, 15 timezone); **299 total** | ✅ |
| `typecheck`, `lint`, `build` clean; all existing pages and APIs still 200 under `npm run start` | ✅ |

**Still to come in Phase 7:** the attendance service (authorisation, validation, percentage calculation), the API routes, the teacher marking screen, the student view and the reports.

### 22.21 Phase 7, service and API stage (2026-08-30)

The attendance domain service and its API. **No screens yet** — nothing in the UI links to any of this.

**Services** — `attendance.service.ts` (marking, correcting, submitting, cancelling, listing, reporting), plus two pure modules with no database access: `attendance/attendance-policy.ts` (percentages, date rules, period bounds) and `attendance/access.ts` (who may mark what).

**Six API routes** under `/api/v1/attendance/` — list and create registers, read one, bulk-mark, submit, cancel, correct one entry, and a student's own attendance. **There is deliberately no DELETE**: cancelling is the closest thing, and it destroys nothing.

**The rules, all enforced on the server**

| Rule | Where |
|---|---|
| Subject-wise marking needs an ACTIVE teaching assignment for that section *and* subject | ADR-083 |
| Daily roll-call needs to be the section's ACTIVE in-charge | ADR-083 |
| The roster is rebuilt from active enrolments; a client roster is never trusted | ADR-084 |
| The academic session comes from the section, never from the request | ADR-084 |
| Only SUBMITTED registers count; drafts and cancellations count for nothing | ADR-085 |
| Teachers mark today; the office marks history, naming the teacher who took it | ADR-086 |
| "My attendance" takes no student id at all | ADR-087 |
| Audit records the status change and student code, never remarks or names | ADR-088 |

**Percentage** — `(PRESENT + LATE) ÷ (PRESENT + LATE + ABSENT + LEAVE)`, with LEAVE moving to the numerator when `attendance.leave_counts_as_present` is on. Never stored; always computed. A student with no counted sessions gets `null` rather than 0%.

**Verification**

| Check | Result |
|---|---|
| **94 attendance tests** — 28 schema, 15 timezone, 30 policy, 21 access | ✅ |
| **42 live API checks** against `npm run start`, covering both allow and refuse paths | ✅ 42/42 |
| Teacher marks assigned subject 201; unassigned subject **403**; other section refused | ✅ |
| In-charge takes daily roll-call 201; a subject teacher who is not in-charge **403** | ✅ |
| Duplicate register → **409**; future date, backdating, periods 0/−1/999 → **400** | ✅ |
| Teacher cannot edit or cancel a submitted register; the office can | ✅ |
| Student reads only their own; `studentId` in the query changes nothing | ✅ |
| Unenrolled student refused in both create and bulk-mark | ✅ |
| Cancelling a submitted register drops it out of the percentage (1 → 0 sessions) | ✅ |
| 15 audit entries written; zero contained a remark or a full name | ✅ |
| Against the college's own (unconfigured) data: clear 400s, no server errors | ✅ |
| `npm test` **350**, lint, typecheck, build clean; Phases 1–6 pages and APIs still 200 | ✅ |

**A defect found by testing and fixed:** the date policy says teachers should "ask the office" to enter an older register, but an administrator with no staff record of their own could not create one at all, and there was no honest name to record. Administrators can now name the teacher who took the register; teachers still cannot (ADR-086).

**Before attendance can be used**, three existing screens need data entered: the **curriculum** (0 rows), **teacher assignments** (0) and **section in-charges** (0). Without them the API correctly refuses everything with messages naming the missing configuration.

### 22.22 Phase 7, Admin attendance screens (2026-08-30)

Two pages and three components. **Admin only** — the staff and student screens and the reports are still to come.

**`/admin/attendance`** — every register, filtered on the server by session, class, division, program, section, subject, teacher, status and date range, and paginated. Each row shows the date, period, class, section, subject (or *Daily roll call*), who took it, its status and how the marks fell. Class, division and program narrow the *section* dropdown in the browser and are never sent to the API — the server authorises one thing, the section, rather than four.

**`/admin/attendance/[id]`** — the register itself: summary tiles, the roster, and one-click marking. Bulk actions, a search within the loaded roster, Save, Submit (with the figures spelled out first), Cancel (reason required) and Correct.

**Marking** is a segmented control of four buttons rather than a dropdown per student — one click each, a real `radiogroup` underneath, and every status shown as an icon **and** a word so nothing depends on colour (ADR-089).

**Percentages** come from the server and are never recomputed in the browser (ADR-090). A draft says "Not counted yet"; an empty register says "No attendance recorded yet", never 0%.

**Permissions** shape what is offered — `attendance.create`, `attendance.update`, `attendance.update_submitted` — but the API decides (ADR-091).

**Empty states** name the screen that fixes them: no curriculum links to Curriculum, no students to Students, no staff to Staff, no session to Academic Sessions.

**Verification**

| Check | Result |
|---|---|
| **16 component tests**; 366 in total | ✅ |
| **16 UI request shapes** against a production build — create, bulk mark, submit, correct, cancel, refresh, curriculum lookup, list filters | ✅ 16/16 |
| `/admin/attendance` renders against the real database with the empty state | ✅ 200 |
| Filter options come from real data (2 classes, 2 divisions, 5 programs, 14 subjects) — nothing hard-coded | ✅ |
| Every filter, a bad `status` value, and an unknown register id | ✅ 200 / 200 / 404 |
| Revoking `attendance.create` hides the button **and** the API returns 403 | ✅ |
| No hydration, boundary or application errors in the rendered HTML | ✅ 0 |
| `npm test`, lint, typecheck, build clean; Phases 1–6 pages and APIs still 200; Drive still connected | ✅ |

**Not verified end to end:** the register screen itself could not be rendered against a database containing students. The throwaway harness serves one database connection and cannot render server-side pages at all, and the college's own database has no enrolled students, no curriculum and no teacher assignments yet. Its behaviour is covered by the component tests and by the 16 API-shape checks it makes; it should be walked through in a browser once a section has students.

### 22.23 Phase 7, Staff attendance screens (2026-08-30)

The teacher's side. **No student view and no reports yet.**

**`/staff/attendance`** — today's date in the college's timezone, and exactly what this teacher may mark: their subjects under *Subjects*, their in-charge sections under *Daily roll call*. Built on the server from their own active records, so there is no section or subject picker and nothing for a teacher to substitute (ADR-092). Registers already opened today appear as *Continue draft* or *View register* instead of a second Start button.

**`/staff/attendance/[id]`** — mark, save, submit. Deliberately narrower than the office's screen: no cancel, no correction, no filters (ADR-093). Built for a phone — a scrolling list rather than a table, a sticky Save/Submit bar, *Mark all present*, and **P / A / L / E** on a focused row as an addition to the buttons.

**Honest saving** — the status line moves *Unsaved changes → Saving… → Saved*, a failure says so and keeps the marks on screen, and a `beforeunload` guard warns before a refresh would lose them. Nothing claims persistence the API did not confirm.

**"Still on the default"** — the register arrives with everyone Present, so the submit dialog names how many students the teacher has not yet touched (ADR-094). That count is client-side only; no `UNMARKED` status was added to the database.

**Empty states** — no assignments ("Ask the administrator to assign your subjects"), no students in a section, and an account not yet linked to a staff record, which now shows a warning rather than a 500.

**Verification**

| Check | Result |
|---|---|
| **34 component tests**; 400 in total | ✅ |
| **23/24 live checks** of the teacher workflow against a production build | ✅ |
| Teacher opens → saves → submits a Biology register | ✅ |
| Section in-charge opens and submits a daily roll call (`subjectId` null) | ✅ |
| Teacher cannot edit, cancel or re-submit after submitting | ✅ 403 / 403 / 409 |
| Duplicate register, backdating, unknown subject | ✅ 409 / 400 / 404 |
| A student cannot open or read a register | ✅ 403 |
| The roster carries no CNIC, father's CNIC or document data | ✅ |
| Staff → `/admin/*` redirected to `/staff`; admin → `/staff/*` redirected to `/admin` | ✅ 307 both ways |
| All five staff portal pages render; no boundary or hydration errors | ✅ 200 |
| `npm test`, lint, typecheck, build clean; admin pages, APIs, Drive and documents unaffected | ✅ |

The one live check that did not pass was "a teacher is redirected away from `/admin/attendance`" on the throwaway harness, which cannot render server-side pages at all. It was confirmed separately against the real database: **307 → /staff**.

### 22.24 Phase 7, Student attendance view (2026-08-30)

**`/student/attendance`** — read-only, and read-only by construction rather than by hiding buttons.

**Overall** — the percentage, how many classes were attended out of how many, and each count. With nothing counted it says *"No attendance recorded yet"*, never 0%.

**By subject** — a card per subject with its own percentage. **Daily roll-call is kept separate**, with its own summary, never folded into a subject's figures (ADR-096).

**My attendance record** — date, subject (or *Daily roll call*), period and status, paginated on the server, with filters for date range (last 7 / 30 days, this month, custom), subject and status. The subject filter offers only subjects that appear in that student's own history.

**Security** — `getMyAttendance` takes no student id, the query schema has no field for one, and the route reads none, so `?studentId=` is not parsed rather than checked (ADR-095). The page contains no control that changes anything, and a test fails if any button is labelled mark, submit, cancel, correct or save.

**Verification**

| Check | Result |
|---|---|
| **26 component tests**; 426 in total | ✅ |
| **20/20 security checks** against a production build, with two students holding different records | ✅ |
| Student A: P1 A0 L1 Lv1 · Student B: P2 A1 L0 Lv0 — separate records | ✅ |
| `?studentId=` changed nothing; the other student's name appeared nowhere | ✅ |
| Create, edit, mark, submit, cancel, and reading a register directly | ✅ all 403 |
| 3 submitted registers counted; the draft and the cancelled one did not | ✅ 3 of 5 |
| Zero counted sessions → percentage `null`, not 0% | ✅ |
| Daily roll-call kept out of the subject list | ✅ |
| No CNIC, B-Form, father's CNIC, Drive id or audit field in the response | ✅ |
| `/student/attendance` renders on the real database; the unlinked-account state explains itself | ✅ 200 |
| Student → `/admin/*` and `/staff/*`, admin → `/student/*` | ✅ 307 each way |
| Admin pages, APIs, Drive, documents, and the whole teacher workflow re-run after the fix | ✅ |

**A defect found by this stage and fixed (ADR-097):** posting to the attendance API with a section id that did not exist returned **404**, while a real one returned **403** — letting an unauthorised caller tell valid section ids from invalid ones, one query at a time. The permission check now runs before any lookup, so both return 403.

**Not verified end to end:** the student page has not been rendered against a database containing attendance. The throwaway harness cannot render server-side pages, and the college's own database has no attendance yet. The rendering is covered by the 26 component tests and the data it renders by the 20 live API checks.

### 22.25 Phase 7, attendance reports (2026-08-30)

The last piece of Phase 7. **No export, no charts, no alerts** — those are deliberately later.

**`/admin/attendance/reports`** — overall figures plus breakdowns by class, division, program, section and subject, from **one grouped query** (ADR-098). Three tabs: Summary, Students (paginated, sorted lowest-attendance-first) and Registers taken (who marked what).

**`/staff/attendance/reports`** — the same figures narrowed to what the teacher may see: a scope picker listing their assigned subjects and the sections they run, then the summary, their students and their own registers.

**Filters** — session, date range (today / last 7 / last 30 / this month / custom), class, division, program, section, subject and attendance type. The class → division → program → section dropdowns narrow each other from the database, so nothing about the college's structure is written into the code. A start date after the end date is rejected.

**Performance** — measured against **12,013 attendance entries, 807 registers, 303 students**:

| Report | SQL statements | Time | Response |
|---|---|---|---|
| Summary (all five breakdowns) | **3** | ~200 ms | 6.4 KB |
| Students, page 1 | **3** | ~110 ms | 4.8 KB |
| Students, **page 5** | **3** | ~106 ms | 4.8 KB |
| Registers, page 1 | **2** | ~100 ms | 6.9 KB |

Page 5 costing the same as page 1 is what "no N+1" looks like measured rather than asserted, and the summary payload does not grow with the data. **No index was added** — the Phase 7 indexes already cover these paths.

**Accuracy** — verified against a hand-calculated dataset (2 classes, 2 divisions, 2 programs, 2 sections, 3 students, 2 subjects, all four statuses, plus a DRAFT and a CANCELLED register deliberately marked all-absent):

| Figure | Expected | Actual |
|---|---|---|
| Overall | P6 L1 Lv1 A1, 7/9 = 77.8% | ✅ identical |
| Registers counted | 5 of 7 (draft + cancelled excluded) | ✅ 5 |
| By class | 1st Year 75%, 2nd Year 100% | ✅ |
| By division | Boys 75%, Girls 100% | ✅ |
| By program | Pre-Medical 75%, Pre-Engineering 100% | ✅ |
| By subject | Biology 80%, Physics 50%, Daily roll call 100% | ✅ |
| Students | One 75%, Two 75%, Three 100% | ✅ |
| With `leave_counts_as_present = true` | overall 8/9 = 88.9%, Physics 100% | ✅ |

**Security — 27/27** live checks: every filter, both sort directions, pagination, an invented sort value rejected, and scope. A teacher saw 6 of the college's 9 records, never saw a subject they do not teach, and got zero rows when naming another section or subject by id. Students receive **403** from every report endpoint and are redirected away from both report pages.

**A defect found and fixed:** the admin report discarded its own server-rendered data and refetched on mount, so the first paint was a skeleton and the HTML contained no report at all. It now uses what the server sent until a filter changes.

**No attendance threshold was invented** (ADR-100). The application has none configured, so the student report sorts lowest-first instead of asserting a rule the college has not chosen.

**Database changes: none.** No migration, no schema edit, no index.

### 22.26 Phase 8, the exam database and the calculation rules (2026-08-30)

The foundation for exams and results. **No exam screens, no marks entry, no result cards, no date sheet, no exports** — those come next, deliberately.

**Eight tables and five enums**, in migration `20260903000000_exams_and_results`:

| Table | What it holds |
|---|---|
| `exam_types` | "First Term", "Send-Up" — rows the Admin manages, none seeded |
| `exams` | One exam in one session, with its status |
| `exam_papers` | A subject in a class, its maximum marks, its passing percentage and its date-sheet slot |
| `grade_scales` / `grade_bands` | The grading scale and its bands |
| `exam_mark_sheets` | One teacher's marks for one paper in one section |
| `marks` | One student's mark for one paper |
| `results` | A generated result, versioned, with its subject breakdown |

**What the database refuses, not just the code** — 16 foreign keys, 11 CHECK constraints and 15 unique indexes:

- a mark's status and its value must agree — `PENDING` carries no mark, `ENTERED` must carry one, `ABSENT` must be exactly zero (ADR-102),
- a paper shared by every programme is `program_id IS NULL`, and `NULLS NOT DISTINCT` stops a second one being created (ADR-109),
- a mark sheet's section and its paper must belong to the same academic session, proved by composite foreign keys rather than a service check,
- one default grading scale, and one current result per student per exam, both as partial unique indexes (ADR-107),
- an INCOMPLETE result can hold no position (ADR-104),
- marks cannot be negative, a paper cannot be worth zero, a passing percentage must be a percentage, and a date-sheet time must look like `HH:MM`,
- deleting a student, subject, exam or teacher who appears in exam history is refused.

**The calculation, with no database at all** (ADR-106) — `src/server/exams/exact.ts` and `grading.ts` import nothing but each other:

- a subject's percentage, grade and pass or fail; an absent student scores zero **and stays recorded as absent**; an unmarked paper is `PENDING` and is never read as a zero,
- an overall result: total, percentage, grade, and PASS only when **every** subject passes **and** the total reaches 50%,
- INCOMPLETE while any mark is missing, with no grade and no position,
- positions by total marks, passing students first, ties sharing a position and consuming the next — 450, 450, 440 gives 1st, 1st, 3rd.

**Arithmetic is exact** (ADR-105). Everything is computed in integer hundredths and compared by cross-multiplication, never by dividing or by reading the rounded percentage. The case that proves it: **149.99 out of 300 displays as 50.00% and still fails**, because the student scored 49.9966% and has not reached half marks.

**77 new tests, and the schema tests found a real defect.** `tests/exam-schema.test.ts` (39) applies all seven migrations to a throwaway PostgreSQL and tries to break each rule; `tests/exam-grading.test.ts` (38) covers every boundary at the value, one hundredth below and one hundredth above. The suite is now **516 tests in 22 files**, all passing.

The defect: the original ABSENT branch read `status = 'ABSENT' AND obtained_marks = 0`. A CHECK only rejects a row that evaluates to FALSE, and `NULL = 0` is NULL — so an absent student with **no mark at all** would have been accepted. Fixed before the migration reached the college's database.

**The migration failed halfway on the pooled connection, and was repaired.** Neon's pooler closed the connection mid-script: the eight tables existed, but the foreign keys, CHECK constraints and later indexes did not, and the leaked advisory lock blocked the retry. A half-applied migration is worse than a failed one, because the schema looks present while silently accepting data it should refuse.

Nothing was dropped to fix it. The statements whose objects were genuinely absent were replayed in a single transaction, then the live database was diffed — every column, index and constraint — against a clean replay of all seven migrations in PGlite, until the two matched exactly. `prisma.config.ts` now runs migrations on `DATABASE_DIRECT_URL` so it cannot happen again (ADR-110).

**Applied to the college's database**, with row counts checked before and after: **every college table unchanged**, the eight new tables empty. The only change outside them was Prisma's own migration bookkeeping.

**Seeded: the confirmed grading scale, and nothing else** (ADR-112) — A+ 90, A 80, B 70, C 60, D 50, F 0, marked default, with no invented remarks text. Exam types are left empty for the Admin. Running the seed twice reports the scale as already existing.

**Production regression** — built, started, and checked against the production build with a temporary admin, staff and student account, all three removed afterwards:

| Checked | Result |
|---|---|
| 18 Admin pages, including all six Academics screens | ✅ 200 |
| Student, staff, user and attendance detail pages | ✅ 200 |
| 6 staff portal pages, 2 student portal pages | ✅ 200 |
| 17 API endpoints | ✅ 200, or a validation error where a parameter is required |
| Google Drive connection | ✅ still connected, `drive.file` scope only |
| Student reaching for `/admin`, `/staff`, `/api/v1/students` | ✅ redirected, 403 |
| `GET /api/v1/attendance/my?studentId=<someone else>` | ✅ 403 — the parameter is ignored |
| Signed out | ✅ 307 on pages, 401 on the API |

`npm test`, `npm run lint`, `npm run typecheck` and `npm run build` are all clean.

**Two questions for the college**, neither of which blocked the work:

1. **Exam types.** None are seeded, because none were confirmed. An admin must add at least one before the first exam.
2. **An incomplete student's percentage** is shown out of the *whole* exam, including papers not yet marked, so the figure can only rise. The alternative — out of the marked papers only — would flatter them.

**Still needed before an exam can be configured:** the college's database has **no section in-charges** recorded, and only one teacher assignment. Marks entry is authorised from `TeacherAssignment` (ADR-111), so those records must be entered on the existing Staff screens first.

### 22.27 Phase 8, Admin exam management and the date sheet (2026-08-31)

The first exam screens. **No marks entry, no mark sheets, no result publication, no student or staff result views, no exports** — those come next, deliberately. **No database change:** the Phase 8 schema was already right.

**Routes**

| Route | What it is |
|---|---|
| `/admin/exams` | The exam list: search, session, type and status filters, paginated on the server |
| `/admin/exams/[id]` | One exam — its papers, its date sheet, and the publish action |
| `/admin/academics/exam-types` | The kinds of examination the college holds |

`Exams` replaces the greyed-out "Exams & Marks" in the sidebar; `Exam Types` joins Academic Management beside Departments and Designations.

**The workflow, as built**

Create exam → add papers → set dates and times → **publish date sheet**. Publishing moves the exam from `DRAFT` to `SCHEDULED`; no new column was needed, because "scheduled" is exactly what a published date sheet means (ADR-113).

Once published the schedule is **frozen** — papers and the exam itself cannot be edited or deleted. The way back is **Withdraw date sheet**, a separate action with its own confirmation and its own audit entry (ADR-114).

**What the server refuses, whatever the browser sends**

- a subject that is not on the chosen class and programme's curriculum,
- a whole-class paper for a subject only some programmes study — it must be on **every** programme's curriculum (ADR-115),
- a second paper for the same subject and the same students, including the whole-class-versus-programme case that would give one student two marks,
- two papers at overlapping times on the same day for the same students (ADR-116),
- a paper dated outside the exam's own dates,
- maximum marks of zero, negative, or with a third decimal place,
- a passing percentage below 0 or above 100,
- a paper that ends before it starts,
- publishing a date sheet with any paper missing a date or a time — the reply lists **every** problem at once, not the first,
- deleting an exam that has any mark sheet, mark or result, or an exam type any exam uses.

**Nothing is invented.** The production database has no exam types, so `/admin/exams` says *"No exam types have been configured yet"* and links to the screen where the admin adds them — it does not offer "First Term" or "Mid Term" as if the college had chosen them.

**Where the rules live.** `src/server/exams/exam-policy.ts` holds the scheduling rules as pure functions — curriculum scope, clashes, publish-readiness and the date-sheet grouping — with no database and no request, the same shape as `attendance-policy.ts` in Phase 7. `buildDateSheet()` and the presentational `DateSheetView` are deliberately reusable, so the staff and student views can render the same schedule without a second copy of the logic (ADR-119).

**Permissions.** Reuses the existing `exams.view` and `exams.manage`. **No new permission was created** (ADR-118).

**Tests: 91 new, 607 in total across 25 files**, all passing.

| File | Covers |
|---|---|
| `tests/exam-policy.test.ts` (44) | curriculum scope, clash detection, publish-readiness, date-sheet grouping, editability |
| `tests/exam-validation.test.ts` (34) | marks, percentages, times, dates, duplicates, the list query, role defaults |
| `tests/exam-ui.test.tsx` (13) | status badges in words, the date sheet, UTC date formatting |

**Verified against a throwaway PostgreSQL, through the production build — 76 checks, all passing.** Seeded with a session, its structure, a curriculum where every programme studies English and Urdu but only Pre-Medical studies Biology, an exam type and an exam. Then: papers created, edited and removed; every refusal above triggered and confirmed; the date sheet published, protected, withdrawn and edited again.

**Two defects found and fixed during this stage:**

1. **`exam_types` has no `description` column.** The schema documentation I rewrote in step 2 listed one that was never in the migration. Rather than migrate for a nicety nobody asked for, the field was removed from the form, the service and the doc. **Reported rather than silently migrated.**
2. **A malformed mark returned 500 instead of 400.** A Zod `.refine` still runs after a failed `.regex`, so `toHundredths('-10')` threw inside validation. `exact.ts` gained `tryHundredths()`, a non-throwing companion for the one place where bad input is expected.

**Production regression — 66 checks, all passing.** Every Admin, Staff and Student page from Phases 1–7, ten existing APIs, and the Google Drive connection (still `drive.file` only, no token exposed). The new screens render their empty states with no stack trace and no raw database error. Staff and students are redirected from `/admin/exams` and get 403 from the API; signed out gets 401 and a redirect. An administrator whose `exams.manage` is revoked can read but not write.

**The exam detail screen was rendered with real content** — four papers, two programmes and a shared paper — with **zero hydration errors and zero server/client boundary errors**, the class of defect ADR-077 exists to catch.

**A note that corrects Phases 6 and 7.** The verification harness was recorded as unable to render server-side pages. It was never a limitation of the harness: `PGLiteSocketServer` accepts one connection unless told otherwise, and a page render needs its session lookup while another query is in flight. `maxConnections: 20` fixes it, and screens can now be verified in full before the real database is touched (ADR-120).

**The college's database is untouched:** 0 exam types, 0 exams, 0 papers, 0 marks, 0 results. No fake data was seeded. Temporary verification accounts were created and removed; the users are back to the original five.

### 22.28 Phase 8, teacher marks entry (2026-08-31)

Teachers can now enter, save and submit marks. **No result generation, no result cards, no student or staff result views, no ranking screen, no exports** — those come next. **No database change:** the Phase 8 schema and the `marks.*` permissions were already right.

**Routes**

| Route | What it is |
|---|---|
| `/staff/exams` | The papers this teacher may mark, grouped by exam |
| `/staff/exams/[id]` | One mark sheet: the roster, the marks, save and submit |
| `/admin/exams/[id]` → **Mark sheets** tab | Who has marked what. Status only |

`Exams & Marks` replaces the greyed-out "Marks" in the staff sidebar.

**The workflow, as built**

Open the paper → enter marks → **Save draft** (as often as needed) → **Submit**. Submitting is refused while any student is unmarked, asks for confirmation, and cannot be undone by the teacher.

**The three states, kept apart everywhere**

| State | In the database | On the screen |
|---|---|---|
| `PENDING` | no value at all | an empty box, "Not entered" |
| `ENTERED` | the mark, to two decimals | the number the teacher typed |
| `ABSENT` | exactly `0.00` | its own control; the box is cleared and disabled |

Nothing infers absence from the number 0, and nothing treats a blank as a mark. Marking a student absent clears anything typed; typing a mark un-marks the absence (ADR-127).

**What the server refuses, whatever the browser sends**

- a teacher without an ACTIVE `TeacherAssignment` for that exact **section and subject** — the Phase 5 records, reused, with no second system and no new permission (ADR-121),
- a section that does not sit the paper — wrong session, wrong class, or a programme the paper does not cover,
- a `studentId` that is not on the section's current roster, including one whose enrollment has ended (ADR-122),
- a mark above the paper's own maximum, below zero, or with a third decimal place,
- `ABSENT` with anything but zero, `ENTERED` with no value, `PENDING` with a value,
- any edit to a submitted sheet, unless the caller holds `marks.update_submitted`,
- a second submission (409), and submission while anybody is `PENDING`,
- marking at all unless the exam is `SCHEDULED` or `MARKS_ENTRY` — **no rule about today's date**, because the college has not set one (ADR-126).

**A save is one atomic request** (ADR-123). The whole sheet goes in one `PATCH`; every row is validated before anything is written, and one bad row rejects the lot. A failed save deliberately does **not** refresh the screen — whatever the teacher typed stays in the boxes with the error above it.

**Concurrent edits are detected, not locked** (ADR-124). The browser sends the sheet's timestamp as it last saw it; if the stored sheet has moved on, the save is a 409 telling them to reload first. One timestamp comparison — no lock table, no lease, nothing to expire.

**Opening the first mark sheet moves the exam to `MARKS_ENTRY`** (ADR-125), which is what makes step 3's "the date sheet can no longer be withdrawn" true rather than merely claimed.

**Tests: 87 new, 694 in total across 28 files**, all passing.

| File | Covers |
|---|---|
| `tests/marks-access.test.ts` (34) | assignment scoping, the exam lifecycle, submitted-sheet protection, the permission model |
| `tests/marks-validation.test.ts` (14) | every status/value combination, decimals, atomic saves, the forged-field case |
| `tests/marks-ui.test.tsx` (39) | the three states on screen, decimals, disabled Save, the submitted view, the failed-save case |

**Verified against a throwaway PostgreSQL, through the production build — 94 checks, all passing.** Seeded with two teachers each assigned Biology in a *different* section, three active students, one whose enrollment ended, and a student login.

| Checked | Result |
|---|---|
| Teacher A is offered exactly one paper: Biology, their own section | ✅ |
| Chemistry, English and the other section are never offered | ✅ |
| The roster is the three active students; the leaver and the other section's student are absent from it | ✅ |
| Teacher A opening Chemistry, English, or Biology in Teacher B's section | ✅ 403 |
| Teacher A reading, writing to, or submitting Teacher B's sheet | ✅ 403, at the API **and** the page |
| A forged `staffId` and `subjectId` in the body | ✅ ignored; the request still 403s |
| 99.5, 100 accepted · 100.01, −1, 47.555 refused | ✅ |
| ABSENT+0 and ABSENT with no value accepted · ABSENT+10 refused | ✅ |
| ENTERED+50 accepted · ENTERED with no value refused | ✅ |
| PENDING with no value accepted · PENDING+0 refused | ✅ |
| One bad row rejects the whole save, and nothing is written | ✅ |
| A stale timestamp is a 409, and the earlier save survives | ✅ |
| Submit with one PENDING refused · entered + absent submits | ✅ |
| Submitted: edit refused, second submit 409, no delete endpoint | ✅ |
| The office corrects a submitted sheet with `marks.update_submitted` | ✅ |
| Student and signed-out callers | ✅ 403 / 401 / 307 |
| The admin board shows counts and the teacher, and carries no marks | ✅ |

**The audit is safe and honest.** `mark_sheet.opened`, `marks.entered`, `marks.updated`, `marks.submitted`, `marks.corrected`. A correction records the **student code**, the old and new status, and the old and new marks — and nothing else. Checked directly against the audit table: no names, no father's name, no CNIC, no B-Form, no admission number, no Drive id, no token.

**A defect found and fixed during this stage:** the audit compared marks as text, so a stored `0` against a written `0.00` looked like a change. Every save logged untouched rows and inflated `changedCount`. Now compared in hundredths, with both sides written the same way — verified: a correction that changes one mark logs exactly one change.

**Production regression — 58 checks, all passing.** Every Admin, Staff and Student page from Phases 1–8, twelve APIs, and Google Drive (still `drive.file` only, no token exposed). The new staff screen renders on the college's database with no exams: an unlinked staff account is told why rather than shown a 500. Zero errors in the server log.

**The college's database is untouched:** 0 exam types, 0 exams, 0 papers, **0 mark sheets, 0 marks**, 0 results. No fake data was seeded. Temporary verification accounts were created and removed; the users are back to the original five.

### 22.29 Phase 8, result generation and publication (2026-08-31)

Results are calculated, reviewed and published. **No student result screen, no teacher result screen, no result cards, no exports, no notifications** — those come next. **No database change:** the Phase 8 schema already carried versioning, `isCurrent`, the DRAFT/PUBLISHED lifecycle and a `correctionReason`.

**Routes**

| Route | What it is |
|---|---|
| `/admin/exams/[id]/results` | Generate, review and publish, on one screen |
| `GET /api/v1/exams/[id]/results` | One page of results, with the summary and the generation preview |
| `POST /api/v1/exams/[id]/results/generate` | Works out every result, atomically |
| `PATCH /api/v1/exams/[id]/results/publish` | Publishes or withdraws |
| `GET /api/v1/results/[id]` | One student's subject breakdown |

**The rules, as the college confirmed them**

- a subject is passed at that paper's own passing percentage, stored on the paper,
- a student passes only by passing **every** subject **and** reaching 50% of the total,
- an absence scores zero, stays recorded as an absence, grades F, fails the subject, and so fails the whole result,
- a student whose papers are not all marked is **INCOMPLETE**, with **no percentage, no grade and no position** (ADR-129),
- positions run by total marks, passing students ahead of failing ones, ties sharing a position and consuming the next.

**Where the arithmetic lives.** Nowhere new. `exams/grading.ts` already decided every figure with no database access (ADR-106); this stage added `assignPositionsByScope` and `reportableFigures` beside it. The service does the lookups, runs those pure functions in memory, and writes.

**Generation is all-or-nothing** (ADR-128). Every required paper × section must have a SUBMITTED mark sheet first, and the refusal names each one that is missing. A section only counts as required when a student is enrolled in it.

**Ranking never mixes programmes** (ADR-130). The existing `results.ranking_scope` setting chooses between section, group and class — and all three keep courses apart, because two students on different courses sit different papers out of different totals.

**A correction supersedes, never overwrites** (ADR-131). Generating twice is refused; regenerating writes a new version, keeps the old one readable, records the reason, and returns everything to draft so a corrected result is not republished without somebody looking at it.

**Historical integrity holds.** A published result stores the names it was printed with and has no foreign keys to the live structure (ADR-132). Verified by renaming the subject, the programme *and* the top grading band underneath a published result: it still reads Biology, Pre-Medical and A+.

**Tests: 40 new, 734 in total across 30 files**, all passing.

| File | Covers |
|---|---|
| `tests/result-ranking.test.ts` (22) | the college's ranking examples, determinism, scope, the overall pass rules, what an incomplete result may report |
| `tests/results-validation.test.ts` (18) | the list query, generate and publish schemas, the permission model, ordinals |

**Verified against a throwaway PostgreSQL, through the production build — 124 checks, all passing.** Seeded with two teachers, four papers, five students and one who enrolled after the marks went in.

| Checked | Result |
|---|---|
| 8 mark sheets filled and submitted by their own teachers | ✅ 24 checks |
| 360/400 → 90.00% → A+ → PASS | ✅ |
| One subject at 40 → FAIL, despite a 77.50% total | ✅ |
| The late joiner → INCOMPLETE, no percentage, no grade, no position | ✅ |
| Tied 360s share 1st; next is 3rd; the failing student is 4th | ✅ |
| The Girls section ranked on its own | ✅ |
| Pass rate 80% — over complete results only, not the incomplete one | ✅ |
| Generating twice → 409, no duplicates | ✅ |
| Publishing twice → 409 | ✅ |
| Regeneration → version 2, version 1 still readable, back to draft | ✅ |
| Subject, programme and grading band renamed → published result unchanged | ✅ 12 checks |
| A real correction: Chemistry 40 → 60 turned FAIL into PASS | ✅ 9 checks |
| Teachers, students and signed-out callers | ✅ 403 / 401 / 307 |
| `?studentId=` on the result list | ✅ ignored |

**The audit is safe and useful** (ADR-133). `result.generated` and `result.published` record counts, version and ranking scope; `result.corrected` also names **which students moved**, by student code, with the outcome, total and grade before and after, plus the reason. A scan of the audit table for CNIC, B-Form, father's name, admission number, password hashes, tokens, Drive ids and student names found none.

**Two defects found and fixed during this stage:**

1. **Percentages lost their decimals.** Prisma's `Decimal.toString()` drops trailing zeros, so 90.00% came back as `"90"` and 82.50% as `"82.5"`. Now reported with `.toFixed(2)` — exact decimal arithmetic, not floating point — so a result card reads the way the college states the rule.
2. **A correction logged nothing about who changed.** The audit recorded only counts. It now names the students whose outcome, total or grade actually moved, which is what makes a correction answerable later.

**Production regression — 63 checks, all passing.** Every Admin, Staff and Student page from Phases 1–8, thirteen APIs, and Google Drive (still `drive.file` only, no token exposed). Unknown exams and results return 404 rather than crashing. Zero errors in the server log.

**One question for the college.** `results.percentage` is NOT NULL, so an INCOMPLETE student's partial percentage is *stored* even though nothing reports it. Making the column nullable is a one-line migration and needs approval — it was not done silently.

**The college's database is untouched:** 0 exams, 0 papers, 0 mark sheets, 0 marks, **0 results**. No fake data was seeded. Temporary verification accounts were created and removed; the users are back to the original five.

### 22.30 A correction: an incomplete result has no percentage (2026-08-31)

`results.percentage` was created NOT NULL, so a student whose papers were not all marked had to be stored with *some* figure. ADR-129 suppressed it at the read boundary; the number itself stayed in the column, one raw query away from being believed. This corrects the column.

**Migration `20260904000000_incomplete_result_has_no_percentage`** — two statements, one column, no data touched:

```sql
ALTER TABLE "results" ALTER COLUMN "percentage" DROP NOT NULL;

ALTER TABLE "results"
  ADD CONSTRAINT "results_percentage_matches_outcome" CHECK (
    ("outcome" = 'INCOMPLETE' AND "percentage" IS NULL)
    OR ("outcome" <> 'INCOMPLETE' AND "percentage" IS NOT NULL)
  );
```

Nullable does not mean optional: the constraint states both halves, so a PASS without a percentage is refused just as firmly as an INCOMPLETE with one (ADR-134). `results_percentage_valid` is deliberately untouched — a CHECK only rejects what it evaluates to FALSE, so a NULL passes it and the 0–100 bound still applies to every value that exists.

**The service now applies the rule at write time too.** `reportableFigures()` already governed what was reported; it now also governs what is stored, so the partial figure is never written in the first place. Nothing else changed — not the grading, not the ranking, not publication.

**Verified before applying.** The generated SQL was scanned: 0 destructive statements, 0 data statements, one table, one column. Applied to a throwaway PostgreSQL first, where the schema tests proved the constraint refuses an INCOMPLETE row carrying a percentage **and** a PASS row without one. Then applied to Neon with `prisma migrate deploy`; `migrate status` reports no drift across all **eight** migrations.

**Verified end to end.** On the throwaway database, regenerating produced a late-joining student stored with `percentage = NULL`, `grade = NULL`, `position = NULL` — where the previous code had stored `0.00` — while every PASS kept its two-decimal figure. The API serialises `null`, never `0`. 15 API checks, all passing.

**Tests: 18 new, 752 in total across 31 files.** `tests/result-percentage.test.ts` (15) covers PASS and FAIL keeping their figures, INCOMPLETE having none of the three, an INCOMPLETE result being unable to receive one accidentally, complete results passing through untouched, and the decimal formatting (`50.00`, `61.67`, `90.00`, and `82.5` reading back as `82.50`). `tests/exam-schema.test.ts` gained 3, applying every migration to a real PostgreSQL.

**One thing worth recording.** The migration assumes no existing INCOMPLETE row already carries a percentage. That holds for the college's database (0 results) and for any fresh replay, which creates the table empty. It did **not** hold for the disposable test database, where rows written by the previous code made the constraint refuse to validate — a useful confirmation that it works. If a backup taken between the previous stage and this one were ever restored, those rows would need normalising first.

**Regression — 63 checks, all passing.** Every Admin, Staff and Student page, thirteen APIs, Google Drive untouched and still `drive.file` only. Zero errors in the server log.

**The college's database:** 0 results, 0 marks, 0 exams. No production test data was created.

### 22.31 Phase 8, the student and staff result portals (2026-08-31)

The last piece of Phase 8. Both screens are **read-only**, both show **published results only**, and both render the stored snapshot. **No result cards, no PDF, no exports, no notifications, no correction UI** — those are later. **No database change.**

**Routes**

| Route | What it is |
|---|---|
| `/student/results` | The student's own published results |
| `/student/results/[id]` | One result, subject by subject |
| `/staff/results` | The teacher's students, in the subjects they teach |
| `GET /api/v1/results/my` · `/my/[id]` | The student's own — no id parameter exists |
| `GET /api/v1/results/staff` | The teacher's scope, with filters and paging |

`My Results` and `Results` replace the greyed-out entries in the student and staff sidebars.

**The student sees their own, and there is no way to ask for anybody else's** (ADR-135). `getMyPublishedResults(ctx)` takes no student id; neither does the detail reader, neither does any schema. Identity is `ctx.studentId` from the session. The detail route takes a **result** id, and a result belonging to someone else comes back as **404** — a 403 would confirm the row exists.

**The teacher sees a subject result, not a student's result** (ADR-136). Each row is one student's mark in one subject they are assigned to teach, in a section they teach it in — expanded from the stored breakdown. The response carries no overall outcome, no total, no position and no version, and the fields it does carry are named `subjectOutcome` and `markStatus` so they cannot be mistaken for the student's result. Scope is their ACTIVE `TeacherAssignment` records; filters narrow inside it and never widen it.

**Both render the snapshot** (ADR-137). Nothing is recalculated from the live curriculum, grade bands, subject names or enrolment.

**What each outcome shows**

| Outcome | Percentage | Grade | Position |
|---|---|---|---|
| PASS | the stored figure | the stored grade | the stored position |
| FAIL | the stored figure | the stored grade | the stored position |
| INCOMPLETE | — | — | — |

An incomplete result says *"Result incomplete"* and *"Your final result is not yet complete"*, and never shows 0%. An **absence** shows `Absent` with `0` and grade `F`; an **unmarked** paper shows a dash. The two are never confused.

**Responsive.** The student list is cards, and the subject breakdown is a stack of small cards on a phone and a table from `sm` upwards — students are almost always on a phone, and six columns do not fit one. The student list is a plain Server Component with no client JavaScript at all.

**Tests: 27 new, 779 in total across 32 files**, all passing. `tests/results-portal-ui.test.tsx` (21) covers every display rule above plus a check that **no control on either screen matches a mutating verb** and that no mutating endpoint is called; `tests/results-validation.test.ts` gained 6 for the teacher query, including that it has no `staffId` or `studentId` field at all.

**Verified against a throwaway PostgreSQL, through the production build — 70 checks, all passing.**

| Checked | Result |
|---|---|
| While results are only generated, student and teacher both see nothing | ✅ |
| A student's own draft result is a 404 even to them | ✅ |
| Once published, the student sees exactly one result — their own | ✅ |
| Student A opening student B's result | ✅ 404, while student B opens it fine |
| `?studentId=<classmate>` on the list **and** the detail route | ✅ ignored |
| A student reaching the office's endpoints | ✅ 403 |
| Teacher A (one subject, one section) sees only that subject and section | ✅ |
| Teacher B's section never appears for teacher A | ✅ |
| Asking for a section or subject they do not teach | ✅ returns nothing |
| No overall outcome, total, position or version in the teacher response | ✅ |
| A teacher reaching the office's endpoints, or publishing | ✅ 403 |
| Signed out | ✅ 401 on the APIs, 307 on the pages |
| Renaming the subject under a published result | ✅ 10 checks: nothing moved |

**Production regression — 82 checks, all passing.** Every Admin, Staff and Student page including the two new ones, thirteen APIs, Google Drive untouched and still `drive.file` only. An unlinked student or staff account is told why rather than shown a 500. A teacher cannot use the student endpoint, a student cannot use the staff endpoint, and an administrator can use neither.

**One thing renamed.** `TeacherResultRow.outcome` and `.status` became `subjectOutcome` and `markStatus`. A verification check that asserted "no overall outcome is exposed" could not tell the subject's pass/fail from the student's, and neither could a reader. Nothing was leaking — the field was always the subject's — but the names now say so.

**The college's database is untouched:** 0 exams, 0 marks, 0 results. No production test data was created; the temporary verification accounts were removed.

### 22.32 Phase 9, the official result card (2026-08-31)

A printable, official-looking Kabirian College result card. **Presentation only** — no calculation, no grading, no ranking, no publication changed. **No database change, no new dependency.**

**Where it lives.** `/student/results/[id]` now renders the card itself, with a **Print Result Card** button above it. The card is the on-screen preview *and* the printed document, so what a student sees is what comes out of the printer (ADR-140).

**The logo.** The college's `college logo.jpeg` was copied byte for byte to `public/brand/college-logo.jpeg` — Next serves static files only from `public/`, so the root file was unreachable by a browser. Nothing was redrawn, recoloured, cropped or resized, and the served bytes are verified identical. It is rendered eagerly with a plain `<img>`: `next/image` lazy-loads, and a logo that has not loaded when Print is pressed is a card with a blank space where the crest belongs (ADR-139).

**What the card shows** — all of it from the stored published snapshot, nothing recalculated:

- the logo, **KABIRIAN COLLEGE**, *INSPIRING MINDS SHAPING FUTURE*, and a boxed **RESULT CARD**;
- examination, exam type, academic session;
- student name, student code, roll number, class, division, programme, section;
- a bordered table of every subject — Subject · Max Marks · Obtained · % · Grade · Status;
- a summary strip — Total Marks · Obtained · Percentage · Grade · **Result** · Position;
- three unnamed signature areas: Class Teacher / Subject Teacher, Examination Incharge, Principal;
- *"This result card is generated from the officially published examination result."*

**PASS and FAIL** show their stored percentage, grade and position, and the outcome word is always printed — never colour alone. **INCOMPLETE** shows `—` for percentage, grade and position, plus *"Result incomplete — Your final result is not yet complete."*, and never `0%`. **ABSENT** shows `0.00`, grade `F` and the word **Absent**; an unmarked paper shows a dash and "Not marked". The two are never conflated.

**Printing** uses the browser's own dialogue and nothing else — no PDF library, no headless browser, no service (ADR-138). The print stylesheet declares `@page { size: A4 portrait; margin: 12mm }`, hides everything by **visibility** and reveals `.print-area` and its descendants, strips `.print-hide` controls, keeps colours with `print-color-adjust: exact`, and guards blocks with `break-inside: avoid`.

**Responsive.** The card is `max-w-[210mm]` and fluid below that, so it never overflows a phone. Below `sm` the subjects render as a readable stack; from `sm` upwards — and therefore on A4, which is far wider — they render as the bordered table.

**Tests: 6 new, 785 in total across 32 files**, all passing. `tests/results-portal-ui.test.tsx` now covers the card: the logo asset and its eager loading, the header, the student and exam identity, subject rows with stored marks, PASS, FAIL, INCOMPLETE (three dashes, never 0%), ABSENT (`0.00` + `F` + Absent), the signature areas, the official notice with no claim of certification, the `print-area` marking, and that no control matches a mutating verb.

**Verified against a throwaway PostgreSQL, through the production build — 54 checks plus 11 structural, all passing.**

| Checked | Result |
|---|---|
| The logo is served, byte-identical to the college's file | ✅ |
| Preloaded by the markup, so it is there when Print is pressed | ✅ |
| Header, student, exam, subjects, totals, grade, position | ✅ |
| No CNIC, B-Form, father's name, Drive id, token or internal id | ✅ |
| Compiled CSS carries `@page A4 portrait` and the 12mm margin | ✅ |
| Compiled CSS hides all, reveals `.print-area`, strips `.print-hide` | ✅ |
| Colours survive the printer; blocks avoid page breaks | ✅ |
| The card is one `<article>` with no nav, aside or button inside it | ✅ |
| Sidebar, back link and Print button all outside the print area | ✅ |
| Student A opening student B's card | ✅ 404 |
| `?studentId=<classmate>` on the card URL | ✅ ignored |
| A teacher or a signed-out visitor | ✅ 307 |

**On page count.** A four-subject card measures roughly 920px of content against the ~1030px an A4 page allows at 12mm margins, so a normal result prints on one page with room for about three more subject rows. Beyond roughly eight subjects a second page becomes likely — `break-inside: avoid` keeps the header, summary and signatures whole when that happens. **A true one-page confirmation needs a human to open the browser's print preview**; I verified the compiled CSS and the DOM structure rather than claiming a visual check I could not run without adding a browser-automation dependency the brief rules out.

**Production regression — 85 checks, all passing.** Every Admin, Staff and Student page, thirteen APIs, the logo asset, and Google Drive untouched and still `drive.file` only. Zero errors in the server log.

**The college's database is untouched:** 0 exams, 0 marks, 0 results. No production data was created; the temporary verification accounts were removed.

### 22.33 The result card, made to look like a college document (2026-08-31)

A **visual refinement only.** No calculation, grading, ranking, publication, API, authorization, snapshot rule, database table or dependency was touched. The one component [result-card.tsx](src/features/results/result-card.tsx) was restyled and one colour token was added; nothing else in the app changed.

**The header, which is where the complaint was.** The logo now prints **66mm wide** — a third of the page — instead of reading as an icon. It turned out the supplied file is a 1280×960 canvas holding only 572×155 of artwork, so 84% of its height was empty white; painting the whole canvas at that scale would have cost 111mm of page height for 18mm of ink. The image is instead shown at full width in a 6:1 box, which paints the artwork and leaves the blank margin unpainted. Nothing was cropped, redrawn or distorted, and there is 3.3mm of clear space above and below the mark (ADR-141).

Below it, restrained type: **KABIRIAN COLLEGE** in the navy read off the logo itself, the strapline small and light in wide capitals, a hairline rule, **RESULT CARD** in spaced capitals, and a single heavier navy rule closing the header.

**The rest of the document.** Examination, exam type and session in a compact three-up row. Student identity and placement in one bordered grid of small capital labels against plain values. The subject table keeps a thin outer border and hairline row rules with no vertical lines, compact rows and small-capital headers. The overall result is a six-cell grid — Total · Obtained · Percentage / Grade · **Result** · Position — with the outcome word set larger, in navy, always spelled out. Then three signature areas with room to actually sign, and the notice in the smallest type on the page.

No gradients, no rounded panels, no shadows, no tiles, no icons, no second colour.

**The measured result.** A card is **236.7mm of the 273mm** an A4 page allows at 12mm margins.

| | Before | After |
|---|---|---|
| Printed logo artwork | ~15mm wide | **66.1mm** |
| Header block | 26.9mm of mostly blank canvas | 24.7mm, nearly all artwork |
| Subjects on one page | 5 | **8** (7 on an INCOMPLETE card, which carries an extra note) |
| Card height, 4 subjects | 259.1mm | 236.7mm |

Five subjects used to spill onto a second page. An intermediate programme is six to eight, so most real cards would have printed on two.

**Values are never truncated any more.** The old grid clipped long names with an ellipsis, which on paper silently hides data; they wrap instead.

**Tests: 3 new, 788 in total across 32 files**, all passing. The new ones hold the header to its promises: the logo is the official asset at `max-w-[148mm]` with **no breakpoint** able to shrink it on paper, it still declares the file's true 1280×960 with `object-cover` so it cannot be stretched, and the card itself contains no button, link, nav, aside or `print-hide` element.

**Verified through the production build.** Against the throwaway PostgreSQL: **54 card checks**, unchanged and all passing. Then a new harness drives the copy of Edge that ships with Windows over the DevTools protocol — no dependency added — sets **print media at the exact A4 printable area** and measures the page: **13 checks × 3 cards (PASS, INCOMPLETE, FAIL-with-an-absence), all passing.**

| Measured on the page | Result |
|---|---|
| The artwork prints 55–75mm wide | ✅ 66.1mm × 17.9mm |
| A real presence, not an icon | ✅ 36% of the printable width |
| The file is still 1280×960, still `object-cover` | ✅ never stretched |
| The whole artwork is painted, only blank canvas is not | ✅ 3.3mm clear space |
| The card fits one page | ✅ 236.7mm of 273.1mm |
| A full subject list still fits | ✅ 8 subjects (7 when incomplete) |
| No control, no `print-hide` inside the card | ✅ 0 |
| Everything outside the card hidden on paper | ✅ 0 visible |

**And looked at, not just measured.** The PASS, INCOMPLETE and FAIL-with-an-absence cards were rendered and inspected under print media at A4, on a 1280px desktop and on a 390px phone. INCOMPLETE shows dashes for percentage, grade and position and never a zero; an absence shows `0.00`, `F` and **Absent**, plainly distinct from a fail on 48.00. On a phone the card scales without horizontal overflow, the subjects become a readable stack and the logo stays large.

**Production regression — 85 checks, all passing**, zero errors in the server log, no migration drift, Google Drive still `drive.file` only. Plus 13 checks that the real build serves the logo byte-identical to the college's file and compiles the print rules — `@page { size: A4 portrait; margin: 12mm }`, the visibility pair, `print-hide`, `print-color-adjust: exact`, the 148mm logo box and `--color-college: #002850`.

**On the college's own data.** The database now holds **one exam, four marks and one published result** — created by the college itself on 2026-08-31, before this work began. Every row was fingerprinted before the regression and compared afterwards: **exams, papers, marks and results are identical**. The three temporary regression logins were created and removed; the college's five accounts are all that remain.

### 22.34 Phase 10, the timetable (2026-09-01 to 2026-09-07)

**What the college confirmed first.** A fixed daily grid of nine periods, period 6 the break; the office keeps the master timetable; teachers see only their own; **no student timetable**.

**Step 1 — foundation.** `timetable_slots` (migration `20260905000000_timetable_slots`, applied to Neon on 2026-09-01 with row counts verified unchanged before and after), the period grid in `src/server/timetable/periods.ts` (ADR-142), and `timetable-policy.ts`: pure section/teacher/room clash rules, subject-in-curriculum, teacher-holds-active-assignment, and break-period refusal — 45 tests before any screen existed.

**Step 2 — service and API.** `timetable.service.ts` behind `assertAdminArea` + `timetable.manage` for every write; `listTimetable`, `getTimetableSlot`, create, update (changed fields only in the audit), deactivate (never delete); `getMyTimetable` and `getMyClassesToday` for teachers with identity from `ctx.staffId` only (ADR-144). Clashes refused in the service and again by three partial unique indexes, the room one functional over `lower(btrim(room))` (ADR-143).

**Step 3 — the builder.** `/admin/timetable`: session, then section, then a week grid with the break greyed out and labelled; Add Class in an empty cell offering only the section's curriculum, then only teachers with an ACTIVE assignment for that exact section and subject; edit limited to subject, teacher and room; a confirmed deactivate; every 409 turned into a sentence naming the field.

**Step 4 — the teacher.** `/staff/timetable` (day-by-day on a phone, a grid from `md`) and Today's classes on the staff dashboard, sorted by period, dated by the college's own weekday. Read-only: not a button on either. An unlinked staff login is told to get linked rather than shown a blank grid. The student dashboard no longer promises a timetable (ADR-145). Lessons are keyed by cell, not id, after the harness found slot ids in the page source (ADR-146).

**Verified through the production build against a throwaway PostgreSQL — 55 checks, all passing.** Teacher A sees both their classes (1st Year A Biology period 2; 2nd Year B Biology period 4) and nothing of Teacher B's; B sees one; `?staffId=`, `?sectionId=` and `?academicSessionId=` cannot widen either; today's classes are today's only, in period order; student, admin, unlinked staff and signed-out are refused as designed; no stack, Prisma name or internal id reaches a page; `/student/timetable` is 404. Zero errors in the server log.

**Tests: 953 across 37 files.** The two lessons in the live database were created by the college's admin account through the builder on 1 and 4 September; no verification data was written to Neon.

### 22.35 Phase 11, step 1: the notices and events foundation (2026-09-07)

**Schema.** Four enums (`notice_category`, `publish_status`, `audience`, `event_status`) and three tables. `notices` carry a title, plain-text body, category, status and a publish window (`publish_at`, optional `expires_at`) plus a pin. `notice_targets` hold one audience each — everyone, all students, all staff, or one class / division / programme / group / section — with a **NULLS NOT DISTINCT** unique index so no target repeats and a CHECK that the id columns match the audience (ADR-147). `events` carry a date range, a location, a population audience and a status, and may point at a cover picture. `documents` gains `notice_id` and `event_id`; its owner rule becomes *at most one* (ADR-149).

**Migration.** `20260906000000_notices_and_events` — 4 enums, 3 tables, 11 indexes, 1 unique index, 9 foreign keys, 5 CHECKs, and one `DROP CONSTRAINT` / `ADD CONSTRAINT` pair on `documents`. No table dropped, no row touched; the two existing documents were verified (read-only) to satisfy the widened rule. **Not yet applied to Neon** — that is a deliberate step with its own confirmation, as in Phase 10.

**Policy.** `src/server/notices/notice-policy.ts`: target validation and duplicate detection, who a target reaches (student by placement, teacher by teaching scope, admin always), the publish window with exact boundaries, the whole visibility decision, and event visibility (ADR-148, ADR-150).

**Tests: 72 new — 46 policy, 26 schema against a throwaway PostgreSQL replaying the full migration history. 1,025 in total across 39 files.** Lint and typecheck clean.

### 22.36 Phase 11, step 2: validation, services and API (2026-09-08)

**Validation** (`src/validation/notices.ts`). Targets checked by the same `checkTarget` rule the policy uses, so the form is told the exact field; no duplicate audiences; a notice cannot expire before it publishes; an event cannot end before it starts; an event is for a whole population only. Times are wall-clock strings on the college's clock (ADR-151).

**Services.** `notices.service.ts` — the office's list, detail, target options, create, update (targets replaced; audit records only what changed), publish/archive, delete-if-draft; the reader's feed and single notice, built from the reader's own placement or teaching scope, pinned first, category the only filter. `events.service.ts` — the same shape, plus a cover picture chosen from the event's own attachments. Both refuse everything to non-admins with 403 and answer every "not for you" with 404. `documents.service.ts` now accepts notice and event owners (ADR-152).

**API.** `/api/v1/notices` (list, create), `/notices/options`, `/notices/[id]` (get, update, status, delete), `/notices/[id]/attachments`, `/notices/feed`, `/notices/feed/[id]`; the same for `/api/v1/events`, plus `/events/[id]/cover`. Three document types seeded: `NOTICE_ATTACHMENT`, `EVENT_IMAGE`, `EVENT_ATTACHMENT`.

**Verified through the production build against a throwaway PostgreSQL — 85 checks, all passing.** A student in Section 11A sees everyone / students / their section / the pinned notice and not staff, another section, another class, the draft, the scheduled, the expired or the archived; the pinned notice comes first; `?sectionId=` and `?staffId=` are ignored; a teacher sees their sections and class and not another teacher's; a staff login with no assignments sees only the population notices; every "not for you" is a 404; a teacher's real upload is 403; attachments follow their notice's visibility; signed out is 401; no stack or Prisma name in any error.

**A finding.** The harness's PGlite inherits the machine's +05:00 zone and read Prisma's zone-less timestamp parameters five hours early, emptying every feed. Neon's session zone is GMT, so production is unaffected; the harness now pins UTC (ADR-151).

**Tests: 29 new — 24 validation, 5 wall-clock conversion. 1,054 in total across 40 files.** Lint, typecheck and build clean.

### 22.37 Phase 11, step 3: the office's notice and event screens (2026-09-08)

**Admin → Notices** (`/admin/notices`, `/admin/notices/[id]`): a filtered, paged list (status tabs, category, search); an editor that builds the audience from rows — everyone, all students, all staff, or a class / division / programme / group / section chosen from the current session — with times typed on the college's clock; a notice page with the body as written, who it is for, the attachments panel, and the confirmed actions: Publish, Archive, Return to draft, Delete draft (ADR-153).

**Admin → Events** (`/admin/events`, `/admin/events/[id]`): the same shape for a population audience, with pictures and files attached and one picture chosen as the cover.

A **Communication** group in the office's navigation carries both. Nothing was added to the staff or student navigation yet — that is step 4.

**Tests: 18 new component tests** — the editor's exact payload (targets from rows, no status, no zone), a 400 landing on its field with the typed values kept, PUT on edit, server-side filtering through the URL, confirmed publish by PATCH, delete for drafts only, the cover picker by PUT, and the navigation. **1,072 in total across 41 files.**

**Verified through the production build against a throwaway PostgreSQL — 103 checks, all passing**, the 85 from step 2 plus every office page rendering for the admin, a 404 page for a missing notice, no storage or user id in any page, and students, teachers and visitors sent away from all of them.

### 22.38 Phase 11, step 4: the portals (2026-09-08)

**Staff → Notices / Events** and **Student → Notices / Events**: read-only feeds over the reader's own scope, a category filter and paging for notices, past events on request, a cancelled event shown struck through and marked, attachments opened through the document endpoint that re-checks the reader every time (ADR-154). Both dashboards carry a Notices card (the latest five that reach the reader) and an Upcoming events card (the next three). The admin dashboard's "Not built yet" card has nothing left to list and is gone.

**Verified through the production build against a throwaway PostgreSQL — 117 checks, all passing**: the 103 from step 3 plus every portal page rendering with exactly the right notices for a student, two teachers and an unlinked staff login, the dashboards carrying the cards, no office words on any portal page, and the redirects. **1,072 tests across 41 files.** Lint, typecheck and build clean.

### 22.39 Phase 11 migration applied to Neon (2026-09-08)

`20260906000000_notices_and_events` applied through `DATABASE_DIRECT_URL` after a read-only pre-flight (nine applied, none pending but this, zero drift, both existing documents already satisfying the widened owner rule). Verified afterwards: the three tables, four enums, two new `documents` columns, five CHECKs, the `NULLS NOT DISTINCT` target index, nine foreign keys, and every existing row count unchanged (students 3, staff 3, users 9, documents 2, timetable slots 2, results 1, audit 240). The reference seed then created the three attachment document types and nothing else (3 created, everything else "already existed").

One tidy-up: the target index is now declared in the Prisma model under the migration's own name (`map:`), as the attendance register's is, so `migrate diff` reports **zero** difference between Neon and the schema.

### 22.40 Phase 12, dashboards and KPIs (2026-09-08)

**Admin.** Two new tile rows on the existing dashboard. *Today* — registers taken today against the session's sections (submitted and still-draft), attendance this month as a percentage of submitted entries (or "no figure yet"), notices showing, events in the next 30 days. *This session* — exams in progress with open mark sheets, results awaiting publication against those published, sections with a timetable, students missing a required document. Every figure is a `count`/`groupBy`; every block is omitted without the module's permission (ADR-155). The Students and Staff tiles now link to their pages, and the quick actions cover every built module. The "Not built yet" card is gone.

**Staff.** Registers today (sections taught vs. those with a register) and mark sheets opened but not submitted, both from the teacher's own assignments.

**Student.** Attendance this session, published results, and the next paper on a published date sheet for their class and programme — identity from the session only.

**Verified through the production build against a throwaway PostgreSQL — 131 checks, all passing**, including the operations block's exact counts against the seeded data, the student and teacher refused the admin dashboard API, and the roadmap's criterion: the dashboard API answered in **74–94 ms** over five runs and the three pages in **101–114 ms**. **4 new unit tests; 1,076 in total across 41 files.** Lint, typecheck and build clean.

### 22.41 Phase 13, reports and exports (2026-09-08)

**Admin → Reports** (`/admin/reports`): five reports on one screen — students, staff, missing documents, exam mark sheets, results — each filtered by academic session, class, division, programme and section (or department, designation and type for staff; one exam for exams and results) and grouped by any level of the structure. Print uses the browser and the existing print stylesheet; **Download CSV** is a link to the same query as the screen with `format=csv` (ADR-156). Attendance keeps its own report page and gains a CSV export route with the same filters.

**API.** `GET /api/v1/reports/{students|staff|missing-documents|exams|results|attendance}` — JSON or CSV by `format`; ADMIN and `reports.generate` for every one. The CSV is hand-written (`src/server/reports/csv.ts`): quoting, CRLF, a UTF-8 byte-order mark for Excel, and formula-safe cells.

**Verified through the production build against a throwaway PostgreSQL — 158 checks, all passing**: JSON rows equal CSV rows for students, staff and missing documents; the CSV is `text/csv`, an attachment, never cached, with the byte-order mark on the wire; grouping labels the group in full; a missing exam is 404, a missing exam id 400, an unwritable format 400; students, teachers, an unlinked staff login and a visitor are refused the JSON and the CSV alike; the report centre page renders for the office and sends everyone else away.

**Tests: 31 new — 13 for the CSV rules, 12 for the filters, 7 for the report centre (including that the CSV link is the loaded query plus `format=csv`, and that only the report area prints). 1,107 in total across 44 files.** Lint, typecheck and build clean.

### 22.42 Phase 14, audit viewer and security hardening (2026-09-08)

**Admin → Audit Log** (`/admin/audit`): who changed what and when, newest first, filtered by person, module, action, record type and date, with sign-ins hidden unless asked for. Each row is a sentence ("corrected marks for STU-0001 Ali Raza"), linked to the record where it has a page. **Details** opens the fields that changed, before and after — after the redaction rules of ADR-158 — and the facts recorded with it ("Sessions revoked: 3"). **Download CSV** is the same query as the screen. ADMIN and `audit.view`.

**Security headers.** A Content Security Policy with a fresh nonce per page view (`src/proxy.ts`, ADR-157): scripts only with the nonce, no framing, no plugins, no foreign form targets; HSTS in production; `no-store` on every API response; no `X-Powered-By`. A 404 page and an error page that say nothing technical.

**Signed-in devices.** Everyone: **user menu → Signed-in devices** (`/account/devices`) lists the browsers and phones where the account is signed in, with "sign out" per device and "sign out all other devices". Administrators: the same list on a user's page, with "sign out" per device (ADR-159). `Last active` now means what it says.

**Rate limits** for signed-in accounts (ADR-160): five password changes, thirty uploads, thirty exports in a short window, each refused with a 429 and `Retry-After`. **Logging** redacts a national ID by its shape wherever it appears, on top of the by-key list. **Dependencies:** `npm run audit` with a reviewed allowlist, and a GitHub Actions workflow (`.github/workflows/ci.yml`) running lint, typecheck, tests and the audit on every push.

**Verified through the production build against a throwaway PostgreSQL — the Phase 11–13 harness (158 checks) plus a new security harness (77 checks), all passing**: the CSP and nonce on the sign-in, a signed-in and the 404 page, every script stamped, a fresh nonce per request; the audit list without a snapshot, the detail with "Title" before and after and no identifier, sign-ins hidden and shown on request, every filter, the CSV equal to the screen, every non-admin refused everything; a teacher unable to end anyone else's session by either route, an administrator ending one device of a teacher and that device refused at once, "sign out others" leaving exactly one; the sixth password change, the thirty-first export and the thirty-first upload each a 429.

**Tests: 51 new — 14 for the redaction rules, 5 for the filters, 10 for the viewer, 2 for the device names, 5 for log redaction, 5 for the limiter, 6 for the device list, 5 for the policy. 1,158 in total across 52 files.** Lint, typecheck and build clean.

### 22.43 Phase 15, PWA and offline (2026-09-08)

**Installing.** User menu → **Install app**: Chrome, Edge and Samsung Internet show their own install prompt; on an iPhone or iPad the entry opens the Share → *Add to Home Screen* steps (Safari has no prompt). The entry disappears once the app is installed. The manifest gained an id, categories and four home-screen shortcuts — Attendance, Timetable, Notices, Results — that go through `/go/<target>` and land on the signed-in role's page.

**Offline.** A banner appears the moment the connection drops and goes when it is back. The three submits that must reach the server — attendance (office and teacher) and marks — are disabled while offline with a sentence, so nothing is lost and nothing is tried in vain; every other API call fails at once with "You are offline". Opening the app with no connection shows the offline page, which is precached and needs nothing from the server.

**The service worker** (`src/app/sw.ts`, ADR-161) keeps hashed build files, the icons and the offline page — never a page, never the API. A new version waits for the person to choose **Reload** from the prompt. It is served from `/serwist/sw.js`, never cached, and allowed to control the whole site.

**Verified through the production build against a throwaway PostgreSQL — the Phase 11–14 harness (235 checks) plus a new PWA harness (29 checks), all passing**: the worker as JavaScript with the right scope header and no caching, precaching the offline page, the stylesheet and the icons but no JavaScript chunk, network-only for the rest, no `skipWaiting`; the offline page with no session and the CSP; the manifest with a maskable icon and `/go` shortcuts; every icon a PNG; the page linking the manifest and the iOS icon; each shortcut resolving per role and 404 otherwise; the API still `no-store`.

**Tests: 13 new — 9 for the caching rules, shortcuts, manifest and iOS detection, 3 for the banner, the guarded submit and the offline API client, 1 for the worker under the CSP. 1,171 in total across 54 files.** Lint, typecheck and build clean. Note: Lighthouse dropped its PWA category in v12, so the roadmap's "Lighthouse PWA pass" is replaced by Chrome's installability criteria, each verified by the harness; the acceptance test "installs on Android & iOS" needs a real phone — see the checklist in the Phase 15 report.

### 22.44 Phase 16, testing and QA (2026-09-08)

**The harness is in the repository** (`tests/harness/`, ADR-162). `npm run build` then `npm run e2e` starts an in-memory PostgreSQL, applies every migration, seeds the fixtures, starts the production build and runs the API and page checks for Phases 10–15 (264 checks); `.env` is moved aside and restored whatever happens, so nothing can reach Neon. `npm run e2e:browser` adds the Playwright tests; `npm run e2e:load` adds the 5,000-student load check; `--keep` leaves the server up to click around (`harness.admin`).

**Browser tests** (`tests/e2e/`, 44 tests, 22 on each on a Pixel 5 and a 1280-px desktop): the sign-in form refusing a wrong password and opening the portal; sign-out from the menu; every portal sending a visitor to sign in; a student typing an office address landing on their own portal; the office finding a student and writing a notice; the audit log's details without a snapshot; the teacher's lesson on the dashboard and the timetable; the student seeing the notice for their section and not the draft; twenty-three pages that never scroll sideways; the drawer on a phone and the sidebar on a desktop; the manifest; the service worker installing and controlling the page; the offline banner and the API failing at once; the offline page served by the worker; a cache that never holds a page or an API call.

**Load check** with 5,001 students, 100 sections and 505 logins (16 checks, all passing): one page of the student list 83 ms, a name search 149 ms (was 3 s before the roll-number clause was made conditional), the last page as fast as the first, the whole-college students report 318 ms as JSON and 353 ms as a 493 KB CSV, grouped by 101 sections 319 ms, missing documents 276 ms, the admin dashboard 143 ms, the audit log 34 ms, the attendance overview 67 ms, a student's own pages under 140 ms. Budgets are loose (PGlite, not Neon); the point is that nothing grows with the college.

**Coverage gaps closed**: display formatting, the shared validators, the sign-in and password-change schemas, Argon2id hashing (22 new tests). `npm run test:coverage` is available. **1,193 tests in total across 58 files.** CI now runs lint, typecheck, tests, the audit gate, the build, the harness, the browser tests and the load check on every push.

**Still manual**: installing on a real Android and iOS phone, and the Google Drive connection — see the Phase 15 and Phase 6 checklists.

### 22.45 Phase 17, deployment and go-live (2026-09-08)

**Two doors, both documented** (`docs/DEPLOYMENT.md`, ADR-163): Vercel (free; uploads capped at 4 MB; `DATABASE_POOL_MAX=3`; migrations from the administrator's computer) and Docker (a standalone image, non-root, with a health check — CI builds it and starts it on every push). The database: Neon, with `scripts/db-least-privilege.sql` giving the server a role that can read and write rows but never change the schema.

**Backups** (ADR-164): `npm run backup:export` writes every table to JSON with a manifest; `npm run backup:restore` is a dry run until `--yes`, refuses a schema mismatch, and restores in one transaction. **The restore drill** runs in the harness on every push — export, damage, restore, counts, sign-in, restored data served (10 checks, all passing).

**Real data** (ADR-165): `npm run import:students` takes the intake spreadsheet as CSV, validates with the admission form's own schema, matches the structure by name, and creates through the API as the signed-in administrator — dry run by default. **The import drill** in the harness: a quoted name, a "Section B" spelling, a missing section and a bad CNIC (8 checks, all passing).

**For the administrator**: `docs/HANDOVER.md` — accounts and passwords, the academic year, importing students, the daily routine, documents, what to do when something goes wrong, what the system does not do yet. **Monitoring**: the health endpoint with a free uptime monitor, the redacted JSON logs, the audit log. **Go-live checklist** in `docs/DEPLOYMENT.md`.

**Tests: 1,198 across 59 files** (5 new for the CSV reader and its round trip with the writer). Lint, typecheck and build clean. Docker is not installed on the development machine, so the image build is verified by CI, not here.

**In the college's hands** (nothing here can be done from this side): the host variables and domain; the production Google redirect URI and reconnecting Drive; applying the least-privilege role in Neon; one restore drill on a Neon branch; the real intake through the import; installing on one Android phone and one iPhone.

### 22.46 Phase 18, attendance bands and teacher corrections (2026-09-08)

The first of the college's own requests (§23A). The **colour bands** were delivered in Phase 10 (below 75% red, 75–79 amber, 80–89 light green, 90–100 dark green, always with the figure and a word beside the colour). **Teacher corrections** (ADR-166): a teacher now holds `attendance.update_submitted` for their own registers, bounded by a **correction window** the office sets under **Settings → Attendance rules** — seven days after submission by default, 0 for "only the office", up to 60. The teacher's register says until when it can be corrected, or why it cannot; a correction is saved (not re-submitted) and audited under the teacher as before. The office's own corrections are unchanged and unbounded. The "leave counts as present" rule, which existed but had no screen, is on the same card. Changing the rules needs `settings.manage` and is audited with the old and new values.

**Verified through the production build (21 new checks, all passing, alongside the 319 existing)**: the office reads and changes the rules and a teacher cannot; a value over the ceiling is refused; the change is audited with before and after; a teacher opens, submits and then corrects a register, the correction audited under them; a teacher of another subject and a student are refused; with the window at zero the same teacher is refused with a sentence naming the office while the office still can; the register page shows the notice and the Settings page the card.

**Tests: 13 new** — both sides of the window in the policy suite (inside, past, zero, office exempt, assignment still required, drafts and cancelled untouched, the deadline arithmetic), the rules schema, and the teacher's register (the notice with its deadline, saving a correction without a Submit button, the closed-window message). One Phase 7 assertion that teachers must never hold the permission was retired with a note. **1,211 in total across 60 files.** Lint, typecheck and build clean.

### 22.47 Phase 19, profile photos (2026-09-08)

**What the college sees.** A photograph uploaded under *Documents → Photograph* on a student's or staff member's page (the same upload as before, same limits, same replace-and-delete) now appears as a face beside the name: on the student and staff lists, on their pages, on the teacher's register and class list, and in the signed-in person's own menu. Where there is no photograph, the initials show, as before.

**How** (ADR-167): on upload, `sharp` makes a 128 px square JPEG with the metadata stripped and stores it in the `photo_thumbnail` column the schema has carried since Phase 6, in the same transaction as the document; a deletion clears it; a photo from before this phase gets its thumbnail on first request. `GET /api/v1/students/:id/photo` and `/staff/:id/photo` serve it under exactly the document-access rule — office, self, and a teacher of the student's section — privately cacheable with an ETag, versioned by the photo document's id.

**The harness now runs real uploads** (ADR-168): an in-memory `StorageProvider` (`STORAGE_PROVIDER=memory`) replaces "storage off" in the harness, so Phase 6's upload, replace and delete paths are exercised end to end on every push.

**Verified through the production build (27 new checks, all passing, alongside the 341 existing)**: the list says "no photo" and the endpoint is 404 before an upload; a real PNG upload → 201 and the list carries the photo id; the office gets a small JPEG with ETag and private caching, then a 304; the student, and a teacher of their section, see it; a teacher of another section, an unlinked login and a visitor do not; the teacher's class list and the pages carry it; a staff photo is seen by the person and the office but not a colleague or a student, and shows in the person's own menu; a second upload replaces it with a new ETag; deleting the document makes it a 404 and the list says so.

**Tests: 9 new** — the thumbnail (size, format, no metadata, refuses a non-image), the in-memory provider, and the avatar (photo, initials, fallback on error). **1,221 in total across 63 files.** Lint, typecheck and build clean.

### 22.48 Phase 20, homework (2026-09-08)

**Staff → Homework**: a teacher sets a piece of work for one of the section+subject pairs they are assigned to — title, instructions, an optional due date — and attaches worksheets or scans (PDF, JPEG, PNG, 10 MB each) filed in the college's Drive under `Homework/<year>`. They see everything set for the sections they teach in, change or remove their own pieces, and cannot touch a colleague's. **Student → Homework**: their section's work, soonest due first ("Due in 3 days", "Was due yesterday"), past pieces on request, files downloaded through the app. **Admin → Homework**: every piece across the college; the office can set homework in the assigned teacher's name and remove any piece. Every action is audited.

**Data** (ADR-169): one new table, `homework`, and a fifth owner column on `documents` — migration `20260908000000_homework`, applied to Neon on 2026-09-08 (eleven migrations, zero drift), zero drift. A removed piece keeps its row (`deleted_at`) and its audit trail.

**Verified through the production build (35 new checks, all passing, alongside the 368 existing)**: the options offered to a teacher are exactly their assignments; setting, refusals for the unassigned teacher, the colleague and the student; a title required; the office setting in the teacher's name; attaching allowed to the setter and refused to a colleague and a student; the student's feed showing their section's piece with its file and not another section's, opening it, downloading the file, 404 for the other section's; the teacher's list scoped; the office seeing all; changing by the setter and the office and not by a colleague; removing by the setter and the office, after which the piece and its file are gone; the pages for all three portals.

**Tests: 18 new** — the policy from both sides (assignment, ownership, the office, visibility per role, the due-date words), the schemas, and the editor, list and feed. **1,239 in total across 66 files.** Lint, typecheck and build clean.

### 22.49 Phase 21, marks deadline and teacher corrections (2026-09-08)

**Admin → Exams → one exam** carries a **marks deadline**: the last college day on which teachers may enter, correct or submit marks for it. Empty means no deadline, which is how every exam behaved before. Setting or clearing it needs `exams.manage` and is audited with the old and new dates.

**Teachers correct their own submitted sheets** (ADR-170) until that day. The sheet says which state it is in, in the server's own words: *"Submitted — corrections still open until 20 Sep… every correction is recorded in the audit log"*, or the refusal itself. Their assignment still decides which sheets are theirs, and a **PUBLISHED** sheet is never theirs — a result card has been made from those marks.

**The office reopens one paper** from the mark-sheet list: until a stated day, for a stated reason, kept on the row (with a CHECK that a half-recorded reopening cannot exist) and in the audit log. One paper, not the exam. The sheet keeps its status.

**Data:** `exams.marks_deadline`, and four columns on `exam_mark_sheets` — migration `20260908120000_marks_deadline`, applied to Neon on 2026-09-08 (twelve migrations, zero drift). Every existing exam has no deadline, so nothing that worked before changed.

**Verified through the production build (32 new checks, all passing, alongside the 403 existing)**: only the office sets the deadline; a date that is not a date is refused; the change is audited; inside the window a teacher opens, submits and then corrects, and the correction is logged as one; another teacher is refused; with the deadline in the past the teacher is refused with a sentence naming the date and the office, while the office continues; a teacher cannot reopen their own paper; a reopening without a reason, or into the past, is refused; after a reopening the teacher works again and is told why; clearing the deadline restores the old behaviour.

**Tests: 21 new** — the window from both sides (before, on the day, after, reopened, expired reopening, the office exempt, the assignment still required, published sheets, drafts unchanged) and the teacher's screen in its three states. **1,256 in total across 67 files.** Two Phase 8 assertions that teachers must never hold `marks.update_submitted` were retired with a note — that rule is what the college asked to change. The harness gained exam fixtures (`seed-exams.mjs`); Phase 8 predated it.

### 22.50 Phase 22, staff attendance (2026-09-08)

**Admin → Staff Attendance** is the office's own register: everybody employed that day, four buttons each — **Present, Absent, Short leave, Leave** — an "All present" shortcut for the ordinary day, a search box, a department filter, and a running count of the five figures as the marks go in. Nothing is stored until Save. There is no draft and no submit: a class register is handed in by a teacher, but this one belongs to the office, so a mark is a fact when it is saved and a later change is a **correction** with a name on it. The audit log distinguishes the two.

**The month** (Admin → Staff Attendance → This month) is one row per staff member: the four counts and how much of the marked month was worked, in the same colour bands as the students' figures. **Approved leave is left out of that percentage** rather than counted against anyone — sanctioned leave is not a failure to attend — while short leave counts as a day at work and is still shown as its own figure so a pattern stays visible. A month with nothing marked shows a dash, not a nought.

**A staff member sees their own month** on their own profile, read-only, with their days, their remarks and their percentage. The endpoint reads their own staff record and nothing else.

**Only the office**, and only with the new permissions `staff_attendance.view` and `staff_attendance.mark`. Who belongs on a day's register is worked out on the server from joining and leaving dates; a save that names somebody who was not employed that day is refused, not quietly skipped. Any past day may be marked — keying in Monday's paper register is ordinary office work — and the future may not.

**Data:** one table, `staff_attendance`, unique on `(staff_id, date)` — migration `20260908180000_staff_attendance`. Applied to Neon on 2026-09-08 (thirteen migrations, zero drift); the census before and after was identical. Nothing that worked before touches it.

**Verified through the production build (33 new checks, all passing, alongside the 435 existing — 468 in total)**: the register opens with everybody on it and nobody marked; a teacher and a student are refused reading it, reading the month and marking it, and are sent away from the page; two people are marked and a remark is kept; a correction is recorded as a correction, with the day and the number of marks moved; tomorrow is refused with a sentence, and tomorrow's register reads as not editable; an id that is not a staff member gives a 404 and an invented status a 400; yesterday's paper register goes in; the month shows one present plus one leave as 100% and one present plus one absent as 50%; each teacher sees their own record and nothing of the other's; a staff login with no staff record is told so.

**Tests: 31 new** — the counting rule from both sides (short leave as work, ten days of leave not moving a 75%, nothing marked giving null, rounding to 66.7), the future-date refusal, the employment window at its boundaries, what the endpoints will and will not accept, and the three screens. **1,287 in total across 71 files.**

**One old defect fixed on the way past.** The browser sweep caught it: on a phone the account button in the top bar had no accessible name at all — the name is hidden below the `sm` breakpoint and an avatar without a photo is decorative, so a screen reader announced nothing but "button". It now says whose account it is.

### 22.51 Phase 23, complaints (2026-09-09)

**Student → Write to the Office.** A student chooses what it is about — teaching, attendance, exams, fees, the building, behaviour, or something else — gives it a one-line subject and writes what happened. The form says before they send it that an application cannot be edited afterwards, because it is what they said, on the record. They can add to it, and they can take it back, but they cannot rewrite it.

**Admin → Complaints.** Every application, ordered by whatever last happened on it, filtered by state, by subject area, by student, or narrowed to **the ones waiting on us**. Opening one shows the application, the exchange so far, a box to answer in, and the states it may be moved to. Answering a new application moves it to "being looked at" by itself, so nothing needs a second button. Resolving it takes a closing message that reaches the student as the college's answer.

**Who can read one is the point of the phase (ADR-172).** The student who wrote it, and the office. **A teacher cannot read a complaint even holding both complaint permissions** — a complaint may be about a teacher. Another student asking after one is told it does not exist rather than that it is not theirs, because the second answer confirms it is. And **nothing an application says reaches the audit log**: the log records that one was written, what it was about and what state it moved to, never a word of the wording.

**Four states.** Submitted, being looked at, resolved, withdrawn. The office may pick a resolved application back up, but never withdraws one on a student's behalf and never undoes a withdrawal; withdrawing keeps the application, marked. A student may have five open at once, refused with a sentence that says so.

**The dashboard** gained one tile: applications waiting on the office, emphasised when there are any, linking straight to them.

**Data:** two tables, `complaints` and `complaint_replies`, and two enums — migration `20260909090000_complaints`. Applied to Neon on 2026-09-09 (fourteen migrations, zero drift); the census before and after was identical. Nothing that worked before touches it.

**Verified through the production build (61 new checks, all passing, alongside the 469 existing — 530 in total)**: an application written and refused when too short or in a category the college does not have; the office and a teacher refused the ability to write one; the writer and the office able to read it, another student given a 404 with not one word of it in the reply, a teacher a 403; the office's answer moving it off the "waiting on us" list by itself; the reply reading as the college's to the student and as a named person's to the office; a student refused the office's list and refused the right to resolve their own application; the office refused a withdrawal and refused an action on a state it was already in; after resolving, both sides refused with the reason; the office picking it back up; a withdrawal that the office cannot undo; every audit entry carrying the category and none of the wording; the sixth open application refused; and the three screens rendering, with a teacher, a student and a signed-out visitor all sent away from the office's.

**Tests: 49 new** — the rules from both sides (who reads, who writes, who withdraws, where the office may move it, whose move it is next), what the endpoints accept, and the screens in every state they have. **1,336 in total across 74 files.** The harness fixtures gained a **second student**, so "one student cannot see another's" is checked rather than assumed.

**One defect fixed on the way past.** The permission table said a teacher holds the two staff-attendance permissions, added by mistake in Phase 22. Staff attendance asserts the office before it checks any permission, so no teacher could ever have marked a register; the table was wrong all the same, and the account screens repeated it. A duplicated pair of homework entries went with it.

### 22.52 Phase 24, a staff member who is also an admin (2026-09-09)

**One account, both portals.** A member of staff can be given **office access**: Admin → User Accounts → their account → Office access. Their account stays a staff account, and a switcher appears in their user menu: *Switch to the office portal*, and back again. No second password, no second audit trail, and no way to lose track of the fact that Miss Sara the teacher and Miss Sara the clerk are one person.

**The portal they are in is the role they are (ADR-173).** This is the decision the phase turns on. `ctx.role` is read in eighty-five places across fourteen services, and each of them means something precise by it. Rather than making it ambiguous, an account now has a **set** of portals it may use and exactly **one** it is working in — and the one it is working in is what `ctx.role` has always meant. A principal in the staff portal is a teacher: teacher's permissions, teacher's scope, teacher's screens. In the office portal the same person is the office. **Not one of those eighty-five call sites changed.**

**The set is the boundary; the switch is a convenience.** Somebody holding both portals can always move between them, so a bookmark into the office does not fail for a principal — it offers the switch, on a page that asks rather than acting, because loading a page should never quietly change what a person is acting as. Switching is a POST and is audited with where they came from and where they went.

**Taking access away needs nobody to remember anything.** Which portal a session is in lives on the session row and is checked against what the account actually holds on **every request**, so the moment office access is revoked, a session sitting in the office falls back to the staff portal — without signing the person out of what they were doing.

**Two rules kept deliberately conservative.** Nobody changes their own office access, even from the office. And a staff-admin is not counted as an administrator by the rules that stop the college locking itself out of its own system — those refuse more often than strictly necessary, which is the right direction when the failure mode is nobody being able to get in.

**Data:** two columns — `users.admin_access` with a CHECK that keeps it to staff accounts, and `sessions.active_role` — migration `20260909140000_staff_admin_access`. Both defaulted, so every existing account and session behaves exactly as before. Applied to Neon on 2026-09-09 (fifteen migrations, zero drift); the census before and after was identical, and no account holds office access yet.

**Verified through the production build (40 new checks, all passing, alongside the 530 existing — 570 in total)**: a fixture teacher who also holds the office is refused the office's register, the accounts list and students' applications exactly like any teacher until they switch; a link into the office offers the switch while a single-portal teacher is still sent home; the switch page asks first; a teacher without access, a student and an administrator are each refused the switch, as is switching to the portal they are already in; after switching, the same person opens the register, the accounts list, the applications and the office dashboard, is offered the way back, and is still refused a portal they do not hold; their own staff record stays theirs in both portals; office access cannot be given to an administrator, a student, yourself, or by a teacher, and giving it to somebody who has it is a conflict rather than a silent no-op; granting lets an existing session switch at once and revoking puts it back in the staff portal on the next request; both are audited. **The other 530 checks are the real result** — the fixture teacher holds the office throughout every one of them, so anything leaking from the set into the portal would have turned them red.

**Tests: 25 new** — the rules from both sides (which portals an account holds, which one a request is in, what happens when access is taken away mid-session, who may switch, who may grant) and the screens: the switcher appears only for two-portal accounts, moves the session through the API, and office access is offered on a staff account alone. **1,361 in total across 76 files.**

**One thing fixed on the way past.** The unit suite started a worker on every core, and workers began timing out before they had finished starting whenever the machine was busy — red tests with nothing wrong in them. Worker count is now capped, and the browser tests retry once locally as well as in CI, so a slow machine is told apart from a real failure.

### 22.53 Phase 25, fees (2026-09-10)

**Admin → Fees → Packages and rules.** The named fees the college charges, each with a monthly amount, plus the two rules that govern every voucher: which day of the month it falls due, and the flat late fine once that day has passed. A retired package keeps the vouchers already issued against it but takes nobody new.

**On each student's record**, a fee plan: the package they are on, and their own **concession** on top of it in rupees per month. A concession never exceeds the fee it comes off, so a bill can never come out negative. A percentage concession is expressed as a package — that is what packages are for — so there is one kind of discount to reason about rather than two.

**Admin → Fees** is one month at a time: what was billed, what came in, what is still owed, and how many are overdue. **Issue vouchers** bills everybody on a package who does not already have a live voucher for that month, and it offers a **dry run** first, because a bill run for four hundred families is not something anybody should press blind. Running it twice bills nobody twice, and it is the **database** that guarantees that, not a check in the code.

**One voucher** shows the sum in full — fee, concession, late fine, payable, outstanding — and the payments against it. Money is recorded with the day it arrived, how it arrived and a slip number. A payment recorded in error is **voided**, with a reason; it is kept, struck through, and the voucher goes back to what it was. A voucher issued in error is **cancelled**, with a reason, but never while money sits against it: the office voids the payments first, deliberately.

**Student → My Fees** shows a family their own vouchers and what is still to pay, with the office's buttons absent and the clerk's name withheld: a reply from the college is the college's. Another student asking after a voucher is told it does not exist, and a teacher is refused outright.

**Every amount is whole paisa (ADR-174).** Twelve and a half thousand rupees is 1,250,000. Rupees exist only where somebody types them and where a screen prints them; in between, integers, which add and subtract exactly. The database says the same with CHECK constraints. And a voucher's amounts are **frozen when it is issued**, so raising a package's price next year cannot rewrite what a family was asked for last March.

**The late fine is worked out, not stored.** What is owed today comes from the due date on every read, so the figures are right without a nightly job — this deployment has no scheduler, and a fee system that needs one would be wrong every Monday. Once money is taken against a late voucher the fine is frozen onto it, because from then on it is part of what was charged.

**Data:** three tables and two enums, plus two defaulted columns on `students` — migration `20260910090000_fees`. Applied to Neon on 2026-09-10 (sixteen migrations, zero drift); the census before and after was identical, the three tables, the two student columns, the voucher counter and every CHECK are in place, and no fee data exists yet. Nothing that worked before touches it.

**Verified through the production build (64 new checks, all passing, alongside the 570 existing — 634 in total)**: rupees typed with commas and decimals stored as exact paisa; a duplicate package name, a negative amount and an amount with an extra zero all refused; a student on a package with a concession billed 10,000 where the package is 12,500; nobody put on a retired package; a dry run that wrote nothing, then a run that issued one voucher each on the day the office set, then the same run issuing nothing; a part payment leaving exactly 6,000 and the rest settling it; nothing taken against a settled or cancelled voucher; a voucher with money on it refusing to cancel and saying what to do first; a void restoring the voucher and keeping the record; a payment dated in the future refused; a cancelled voucher reissued by the next run; a family seeing only their own; a teacher refused everything.

**Tests: 68 new** — the money helper (what a typed amount becomes, and that no paisa is lost on the way back), the arithmetic of a voucher, the fine at every boundary, who is billed for a month, what may still be done, what the endpoints accept, and the five screens. **1,429 in total across 80 files.**

**One real bug the harness found.** A payment of nought passed validation and was stopped only by the database, so the office got a 500 where it should have got a sentence. It is now refused with words, and a test pins it.

**Also fixed on the way past.** The student record still carried a "Not built yet" card listing attendance, exams and results — all three of which have existed since Phases 7 to 9. It was telling the office that three working modules were missing. The card is gone, and the fee plan sits in its place.

### 22.54 Phase 26, finance and permanent deletion (2026-09-10)

The last phase. Two things the college asked for, and with them the whole of §23A is built.

**Admin → Finance** puts the two sides of the college's money on one screen: what the fees brought in this month, what was spent, what is left over, what was billed and what is still owed. Underneath, **a year drawn month by month** — collected against spent — and a breakdown of where this month's spending went.

**The graph is drawn by hand**, in plain SVG: a dozen rectangles, a viewBox and three guide lines. No charting library, because the college's deployment carries no paid dependencies and a bar chart does not need one. Every bar carries its own figure for a screen reader and a hover, and the same numbers sit underneath in a table anybody can open.

**Expenses are kept exactly like fee payments**: recorded with a heading, a date, how it was paid and a bill number; never edited; voided with a name and a reason when recorded in error. That is not symmetry for its own sake — the two sides are added together on one screen, and a system where income is immutable while spending can be quietly edited produces a figure nobody can defend a year later. Nothing about income is stored twice: the summary reads the fee ledger, so each fact has one number.

**Erasing a record for good.** Every student, staff member and account page now carries an **Erase permanently** card. The server counts everything that refers to the record and either offers the button or explains, by name and number, what stands in the way — "42 attendance marks and 2 results" — and says to deactivate instead.

**Nothing cascades.** A published result card must not stop existing because somebody tidied a list. What goes *with* a record is only its own placement: an enrolment row, a teacher's assignments, a login session. An **account is blocked by the audit log itself**, because an audit entry names who acted by user id and nothing else; erasing a used account would leave a trail saying nobody did it. In practice only a record created by mistake and never used can be erased, which is the honest answer to what was asked.

**The confirmation is the record's own code**, never the word "delete": you cannot type `STU-0042` without looking at which record is open, and the server checks it again rather than trusting the screen.

**Data:** one enum and one table, `expenses` — migration `20260910150000_expenses`. Deletion needed no schema at all. Applied to Neon on 2026-09-10 (seventeen migrations, zero drift); the census before and after was identical, and the table and both CHECK constraints were confirmed on the live database.

**Verified through the production build (53 new checks, all passing, alongside the 634 existing — 687 in total)**: an expense recorded in exact paisa and another under a different heading; spending nothing, spending tomorrow, and a heading the college does not have all refused; a teacher and a student refused the module entirely; the month totalled with the biggest heading first and twelve months ready for the graph; an expense voided with a reason, not voided twice, leaving the month's figures while staying on the list, marked; a student with a history refused with the list of what holds them; a teacher who has taught refused; an account that has acted refused, naming the audit log; your own account refused outright; a student created by mistake erased at the second attempt, after the wrong code was refused and left them untouched; and the finance page rendering its graph as plain SVG with the figures available as a table.

**Tests: 33 new** — the months a graph covers and how tall its bars are, the sum of a month, voiding, every refusal a delete can give, the rules that stop the college locking itself out, the confirmation, and the screens. **1,462 in total across 83 files.**

### 22.55 The money on the dashboard (2026-09-10)

Asked for straight after Phase 26: everything about money on the **admin dashboard**, not only on its own page.

The dashboard now opens with five figures for the month — **fees collected, still owed, billed, spent, left over** — then the year drawn month by month, then where this month's spending went. "Still owed" is emphasised whenever anything is owing and links straight to the overdue vouchers, because that is the number the office acts on.

It reads the **same summary the Finance page reads** rather than counting anything again, so the two screens cannot disagree about a figure. The whole block is absent for an administrator whose fee or finance permission has been revoked, rather than showing them a row of zeroes.

**Verified through the production build (3 new checks, 690 in total)** and **5 new tests (1,467 in total across 83 files)**: the figures, the graph, the links to the two pages the numbers come from, a month that cost more than it took shown as a negative, and nothing at all rendered for a reader who may not see the money.

### 22.56 Phase 27, notifications and three things asked with them (2026-09-11)

Four things, asked together once the college had the whole system in front of it.

**Notifications, in every portal.** A bell in the top bar with what is unread behind it, a **red dot on the button** each unread thing belongs to, a **number on the home-screen icon**, and a page listing everything. Opening a page clears that part of the college and the dot goes; opening one notification clears just that one; "mark all read" empties it.

The college is told about the things that matter: a **notice** published to the audience it was addressed to, an **event** published or cancelled, **homework** set for the section it was set for, a **date sheet** published to the classes sitting it, a **result** published to the students whose own result it is, an **application** to the office and its answer back to the student, and a **fee voucher** to the family it belongs to. Nobody is told about their own action, and nobody is told about something they could not open.

**How it works (ADR-176).** One row per person per thing, written the moment it happens. Read state then belongs to each person rather than being shared, and a student admitted next week does not open the app to a wall of last week's news. Recipients are worked out on the server from the facts the module already had. A CHECK constraint keeps every link a path inside this app, and every link lands on a page that checks permission for itself: a notification is a nudge, never a way round a rule. Writing one can never break the thing it announces.

**The complaint thread keeps itself current.** While an application is open and the tab is being looked at, it refreshes every five seconds, so a reply typed at the other end appears without anybody pressing anything. It is a poll, not a socket, and the reason is money: there is no push service and no socket in this deployment because neither is free to run. The count in the bell refreshes the same way, once a minute, and not at all while the tab is in the background.

**The fee voucher prints.** Three copies on one A4 sheet — bank, college, student — each with the voucher number, the month, the due date, the student, the fee, the concession, any late fine, and what is payable, with a line for each signature. Saved as a PDF by the browser's own print dialogue, exactly as the result card has been since Phase 9: no PDF library and no headless browser, both of which were ruled out at the start.

**Payments first on the dashboard.** The money section is renamed from "Money" to **Payments** and moved to the top, above today's registers.

**Data:** one enum and one table, `notifications` — migration `20260911090000_notifications`. Applied to Neon on 2026-09-11 (eighteen migrations, zero drift); the census before and after was identical, and the table, its two indexes, the seven kinds and the constraint that keeps every link inside the app were confirmed on the live database.

**Verified through the production build (40 new checks, all passing, alongside the 690 existing — 730 in total)**: homework told the section and not the teacher who set it nor another section; an application told the office and the answer told the student, each linked to their own copy; a notice told the students it was addressed to, told nobody while it was a draft, and never told the staff; marking one read took one off the count and marking it twice changed nothing; opening a page cleared that part and left the rest; a path that would leave the site was refused; one person's count was never another's; and the voucher printed three copies, opened for the office and the family, and was refused to another student and to a teacher.

**Tests: 27 new** — which button wears a dot, what the app icon says, where a notification may lead, the bell and its list, the dots in the menu, and the printed voucher. **1,494 in total across 85 files.**

**Two real bugs found on the way, both in this phase's own work.** The unread counts were first read with a grouped query, which through the driver adapter bound its parameters wrongly and turned the whole dashboard into a **500 — but only for somebody who actually had notifications waiting**, which is why it survived the first pass and was caught by the two-portal account in the harness. Counting the rows instead is the same work at this size and cannot fail that way. And a malformed reply from the summary endpoint would have replaced the count on screen and crashed every signed-in page; only a well-formed summary is now allowed to. The harness itself learned to print unhandled server errors, which is how the first one was found at all.

### 22.57 Phase 28, the fee is annual (2026-09-11)

The college looked at the finished fee module and corrected the assumption underneath it. Phase 25 billed **monthly**, on the answer given on 7 September. The college charges **annually**, and families pay in instalments whenever they can. Four changes followed from that, all asked for together.

**The fee is a year's fee, made of optional heads.** Tuition, annual funds, events funds, board registration, board admission, a tour, and an "Others" the office names itself. A student may be charged one of them or all seven; every box on the form can be left empty. One voucher per student per academic session holds the year, and each payment against it is an instalment.

**A due date is optional, and so the late fine almost never applies.** "They pay when they are easy" means most vouchers should carry no date, so the run leaves it empty unless the office types one. A voucher with no due date is never overdue and never fined — the arithmetic says so, not a screen.

**Fee packages are gone.** The college asked for them to go: with amounts typed per student, a package was a template nobody would keep current.

**The fee and the documents are captured at admission.** The heads are on the admission form and written in the same transaction that creates the student. Documents are attached at the counter and uploaded the moment the record exists, because a file cannot belong to a student who does not exist yet; an upload that fails does not undo the admission, and the office is told which file to try again. **Staff get a salary field** on their form for the same reason: it is known when somebody is hired, and it shows on their record to anybody who may see the college's money.

**A printed voucher shows what has been paid and what is left**, and not the year's total. A family paying in instalments needs one number at the counter; printing the total beside it invites paying the wrong figure. The office's own screen still shows the whole sum, itemised head by head, because the office is reconciling rather than paying.

**What a voucher charged is frozen on it, line by line.** Changing next year's tuition, or fixing this year's, never rewrites what a family was already asked for — and with instalments running for months, that window is long.

**Data:** one enum and two tables (`student_fee_lines`, `fee_voucher_lines`), the monthly columns dropped from `fee_vouchers`, `fee_packages` dropped entirely, and `staff.salary_paisa` added — migration `20260911140000_annual_fees`. The migration **deletes** the fee rows on the live database: two test packages, one voucher for a student recorded as “testing as student”, and one Rs 150 cash payment. Every row was listed and checked before the migration was written; all of it is the office trying the module out. **Applied to Neon on 2026-09-09** (nineteen migrations, zero drift). The census before and after differed in exactly the four rows named above and nowhere else: `fee_packages` gone, `fee_payments` 1 → 0, `fee_vouchers` 1 → 0, the two new tables at 0, and every other table — 3 students, 3 staff, 9 users, 299 audit entries, 24 sections — unchanged to the row.

**It went out in the wrong order, and the college saw it.** The Phase 28 and 29 code was pushed and deployed while this migration was still waiting for the go-ahead, so for two days the live app asked Neon for tables it did not have: the admin dashboard, every fee page and the staff pages answered "Something went wrong", while sign-in and the rest of the system carried on. A migration that deletes rows rightly waits for a person to say yes — but the code that depends on it must wait with it. **Code that needs a migration is not deployed until the migration is applied**, and if a phase has to end before the go-ahead comes, it ends on a branch rather than on `main`.

**Verified through the production build (65 fee checks, all passing, alongside the rest — 731 in total)**: a fee set from three heads adding to the year with the concession off, keeping the office's own words for the "Others" line; another student charged tuition alone; a head the college does not charge, a line of nothing and an amount with an extra zero each refused, with the fee unchanged after every refusal; a dry run that wrote nothing, then a run issuing one voucher each with no due date, then the same run issuing nothing; the fee changed afterwards without rewriting the voucher already issued; two instalments, the first leaving exactly 24,500 and reporting 29% collected, the second settling it; a void putting it back to part paid; a voucher with no due date carrying no fine and never overdue; a cancelled voucher reissued; a family seeing only their own; the admission form offering every head and the document checklist; and the staff form asking for a salary.

**Tests: 1,497 across 85 files.** The fee policy, validation and screens were reworked rather than added to, because the model underneath them changed.

### 22.63 The timetable the college actually runs (2026-09-10)

The college sent its printed timetable, and it does three things the system could not hold.

**Its columns are combinations.** "1st Year Girls Bio/Math" is one column, one teacher, one room — and two of this system's sections sitting together. Written the only way the old shape allowed, as two lessons, the teacher's own unique index called it a clash, quite rightly: one teacher cannot be in two places.

**Its cells are sometimes several lessons at once.** "Ch / Comp / Isl(E) — Sir Hassan / Miss Arooj / Miss Huma" is three teachers taking one room of students split by what each takes. The section's index refused that outright.

**Its two campuses do not break together.** The girls stop at 11:10; the boys teach through it and stop at 11:40. The break was a property of one college-wide grid.

**A lesson now covers sections rather than belonging to one** (ADR-181). That single change answers the first two at once: a combined class is ONE row, which is both the truth and what makes the teacher's index work again; a split is two rows over one section, which the new index allows as long as the subjects differ. The break moved to the campus — `divisions.break_period`, null meaning the college default — and a lesson covering both campuses in either of their breaks is refused with the message naming whose break it is.

**Applied to Neon on 2026-09-10** (twenty-one migrations, zero drift). The census differed in exactly what it should: the new join table with four rows, one per existing lesson, and a table count of 51. Every lesson kept its section, its teacher and its active state; nothing was deleted, because there was nothing here to delete.

**A bug the tests caught before the college did.** Deactivating a lesson left its section rows active, and those rows carry the partial unique index — so a lesson nobody taught any more would have held its cell for ever, which is precisely what a partial index exists to prevent.

### 22.67 Copying a day of the week (2026-09-10)

The college's point: *"in some cases the timetable for Monday is the same for Wednesday and Friday."* Typing it out three times is a chore and three chances to get it wrong.

**Admin → Timetable → a section → Copy a day.** Choose the day to copy, tick the days to copy it on to, and it is written once. Three things it is careful about:

**A day that already has lessons is left alone** unless the office ticks *replace what is already there*. Quietly discarding somebody's afternoon would be worse than making them press the button twice, so the reply names the days it did not touch.

**Every copied lesson is checked like a hand-typed one.** A teacher already busy on Wednesday at that hour is reported by name — *"Tuesday, period 2: Biology with Sara Khan — This teacher is already taking another lesson in this period"* — and the rest of the day still copies. A half-copied day the office can see beats a refusal it has to unpick.

**A lesson shared with other sections is copied whole**, because it is one lesson covering all of them. The dialogue says so before the button is pressed.

**Verified through the production build (17 new checks)** and **1,592 tests**, nine of them on the dialogue.

**Two checks of mine were passing for the wrong reason.** Both sent `room: null`, which the schema refuses outright — it takes a string or nothing — so the request never reached the logic being tested. One of them claimed to prove that a period the college does not have is refused; it was proving that `null` is not a string. Worth remembering: *a check that passes tells you nothing until you know why it passed.*

### 22.66 No break, and a day the college sets itself (2026-09-10)

Two requests that turned out to be one: **remove the break from the timetable**, and **make the period times editable**.

Granting the second grants the first. Once the office can say when each period runs, a break is simply an hour they choose not to fill — a gap between two periods, or a period with nothing in it. So `isBreak` is gone from the grid, nothing refuses a lesson in what used to be period 6, both timetable grids draw every period as an ordinary row, and `divisions.break_period` — added that same morning and never given a value — is dropped. ADR-182 has the reasoning, and supersedes the campus break in ADR-181.

**Admin → Timetable** now carries the day itself below the week: the number of each period and the times it runs, with rows to add and remove. A lesson stores a period **number**, never a time, so moving a bell moves every lesson in that period with it and rewrites nothing.

**Two rules the store keeps.** A period something already refers to cannot be removed — its number is on timetable rows and attendance registers, and the refusal says which period and what is still in it; its times may move as freely as the college likes. And a grid may not overlap itself: every clash rule compares period *numbers*, so two periods sharing an hour would put a teacher in two lessons at once while every check called the timetable sound.

**The grid is a setting rather than a table.** Nine rows the office edits together, referred to by number rather than by a foreign key. `DEFAULT_PERIODS` stays in the code as what the college started with, and as what a stored grid falls back to if it is ever unreadable.

**Verified through the production build (21 new checks)** and **1,582 tests**, including eight on the editor: the day it is running, no break in sight, nothing to save until something changes, the whole day sent rather than the one row that moved, adding and removing periods, undoing, and the server's refusal shown in its own words with the office's edit still on screen.

### 22.65 A whole year in one press (2026-09-10)

The college's point: *"if there is a common subject like English that is in all the sections of 1st year, there must be a system so the admin can add accordingly."*

There are **24 sections** — twelve in each year, six programmes on each campus. Putting one teacher against English for the whole of 1st Year meant ticking twelve boxes, and the timetable's "also taught to" was the same twelve again. That is the sort of chore that gets done wrong on a Friday afternoon and then quietly wrong all year.

Both lists now carry a row of buttons — **All 1st Year**, **All 2nd Year**, and a campus button where a year has more than one. Press a year, tick English once, press **same as the first**, and the whole year is done in three clicks rather than twenty-four.

They are **built from the sections themselves**, not written down, so a new class or a new campus appears the day the college creates one. Each is a toggle, so overshooting is one press to undo, and a button shows as on only when *every* one of its sections is — a year that is eleven-twelfths ticked is not a ticked year.

**Nothing here decides anything.** It ticks boxes a person could have ticked one at a time, and every pairing is still checked by the server against that section's own curriculum.

**Tests: 11 new.** The whole year in one press; one campus without the other; pressing off again; showing on only when every section is; keeping selections made elsewhere; no campus button for a year that has only one; and the same button working inside the assignment dialogue. **1,571 in total across 89 files.**

### 22.64 A teacher's subjects need not be the same in every class (2026-09-10)

The college's words: *"a teacher may be teaching English and Urdu in 1st Year Biology Boys, while in 1st Year Biology Girls, the same teacher teaches only English, and Urdu is taught by another teacher."*

The database always allowed that — an assignment is one row of *(teacher, section, subject)*. **The dialogue built the day before did not.** It ticked sections and subjects and made every pairing of the two, so ticking both classes and both subjects gave Urdu to the girls as well. The office could have saved twice and got it right, but a screen that implies something false about the college's own data is how data gets entered wrong.

So the subjects are chosen **per section**. Each ticked section gets its own list, drawn from its own curriculum, and **"same as the first"** copies one down when they genuinely are the same — the common case stays one click, and the uncommon one is possible at all. The request now names explicit pairings rather than two lists to multiply, so nothing can be created that was not ticked.

**Tests: the college's own case is one of them** — two subjects in one class and one in another, asserting both the request body and that the second class did not quietly acquire the extra subject.

### 22.62 The old system's fee ledger, brought across (2026-09-10)

The previous system's `installment.DBF` holds one row per student per session: the year's tuition, any concession, the annual and events funds, and twelve months of what was asked for, what came in and when. For **2026-27** that is 111 students and 35 receipts, and all of it is now in this system, set through the same endpoints the office's own screens use.

**Reconciled against the old ledger, student by student:**

| | |
|---|---|
| Students charged | **111 of 111**, to the rupee |
| Concessions | **111 of 111** |
| Receipts matching | **110 of 111 students** |
| Vouchers | 111 · **Rs 3,449,930** billed for the year |
| Money received | **Rs 273,200** across 34 payments |

The one student who does not match is **Ayesha Huma**: Rs 2,800 of her Rs 6,300 is in, and the missing Rs 3,500 is dated **10 October 2026** in the old file — a month in the future, which this system refuses. It needs the office to say what the date should be. **Laiba Munir's** Rs 5,000 went in as the old system has it, dated 25 August **2025**, which reads like a typo for 2026; correcting it means voiding the payment and recording it again.

**It took five attempts, and each one taught something worth keeping.**

*A whole college in one request.* The first run put every voucher in a single transaction and failed having issued nothing. Batching inside the transaction was the obvious fix and was the wrong one: the transaction was never the limit, **the request** was. A hosted request is stopped after a fixed number of seconds whatever it is doing — sections of eleven students went through, sections of seventeen, twenty and twenty-nine came back as 500s. A run may now be **bounded**: `limit` says how many vouchers to issue and the reply says how many are still waiting, so the caller comes back rather than being cut off. Anyone who already has a voucher is skipped, which is what makes calling it in a loop safe.

*Two runs ended with nothing to go on but "done".* A terminal scrolls and a window gets closed, and a failure that is only printed is a failure nobody can act on. The importer now writes **`fee-import-report.txt`** every time — finished or fallen over, message and stack included. The very next run's report named the three failing sections in one line, after two blind attempts had named nothing.

*One dropped connection ended a run that had done almost all of its work.* Several hundred requests over the open internet will have a bad moment; every one now retries a connection that never produced an answer, and a single receipt that will not go through is reported rather than abandoning the thirty after it.

*The password was on screen.* Twice — readline only hides typing when it decides the input is a terminal, and Windows `cmd.exe` does not satisfy it. Both importers now read it from the raw input stream with nothing echoed at all.

**The guard earned its place.** Every one of the five runs was safe to repeat because each step skips what is already done: plans are replaced rather than added to, vouchers skip anyone who has one, and payments refuse a voucher that had money on it before the run began. Twenty-three of the last run's twenty-three "problems" were that guard declining to record a receipt twice.

### 22.61 The last two "coming soon" pages, and handing in your own papers (2026-09-10)

Two items in the sidebar had been greyed out since the early phases, listed honestly as not built rather than as fake links. Both are now real, and the flag is gone from the navigation entirely — there is nothing left in this system marked coming soon.

**Student, My Profile.** A student's own record: their placement and photograph, their personal and family details, their admission, what they did before joining, the subjects they study, and their documents. It is read with the student id on their session rather than one from the URL, so there is no parameter to tamper with — a student asking for this can only ever be asking for themselves. Nothing on it is withheld, because all of it is a fact about them the college already holds, and nothing on it can be edited: the page says plainly that corrections go through the office.

**Admin, Results.** Each exam's results have always lived behind that exam; what was missing was the view across all of them. Every exam in the session with how many results it holds, how many passed, failed and are incomplete, its pass rate, and whether it is published or held back — with the session switcher for last year. The counting is grouped in the database, so a session with ten thousand results costs the same as one with thirty. A pass rate counts only students with a complete result: anyone still missing a mark is incomplete, never a failure.

**Students and teachers can hand in their own documents.** The college asked for this with a condition attached — they may upload, and after that they must go to the office. The rule turns on a distinction the code already made: uploading needs `documents.upload` when nothing is there and `documents.replace` when something is, so *a person may upload on their own record and nothing else*. The first hand-in is theirs; the second is a replace, and a replace is the office's. Deleting is the office's always. Whether it is a replace is decided from the database, never from what the browser sends. ADR-180 has the reasoning.

**They are warned before it goes, not after.** Choosing a file opens a dialogue that says it cannot be changed or removed afterwards and that a correction means asking the office. Nothing is sent until that is accepted — a wrong file handed in is a trip to the office for somebody, and the moment to prevent it is beforehand.

**Verified through the production build (20 new checks)**: a student opens their own profile and a teacher is sent away from it; the office opens Results and neither a teacher nor a student can; a student uploads their own missing roll-number slip, is refused when they upload over it and refused when they delete it, while the office is bound by none of that; a teacher hands in their own CV but not a second one, and never against another teacher's record.

**Tests: 8 new** — the warning shown, nothing sent while it is open, nothing sent when it is refused, no removal offered anywhere, and the office's own view unchanged by any of it. **1,533 in total across 88 files.**

### 22.60 Assigning a teacher to many sections at once (2026-09-09)

The college's own timetable made the case: Sir Arish takes English in six of its seven columns, and the assignment dialogue asked him to be entered six times, walking a cascade of five dropdowns each time. **Staff, a teacher, Assign subjects** now lists every section in the session under its class, division and program — no cascade, because a teacher crossing classes and campuses is the normal case here, not the exception. Tick the sections, tick the subjects, and every pairing is made in one save.

**The subjects offered are the ones those sections are actually taught.** Ticking sections from two programs shows the union of both curricula; a pairing only one of them allows — Biology offered to an ICS section — is skipped and reported by name, while every other pairing is still made. The office gets three plain lists back: what was assigned, what the teacher already held, and what the curriculum refused and why.

**The older single-pairing shape still works.** The endpoint reads the body and picks the schema, so anything sending one section and one subject is unaffected.

**Verified through the production build (17 new checks)**: the cross product is made, a second identical save makes nothing twice, a subject on no curriculum is refused with the curriculum named, a section from another session cannot be smuggled in, an empty list of either is refused, and neither a teacher nor a student may assign anybody.

**Tests: 15 new** — five on the schema and ten on the dialogue, including that the subject list is the union of two curricula with no duplicate, that the count of assignments is shown before the save is made, and that a failed save leaves every tick where the office put it. **1,525 in total across 87 files.**

**One thing the harness was quietly not doing.** It runs `next start` against whatever build is on disk — it does not build. The first run of these checks failed eleven ways against a build made before the change, which looked like eleven bugs and was one stale directory. Worth remembering: **`npm run build` before `node tests/harness/run.mjs`**, or the harness is testing the past.

### 22.59 The college's old system, read into this one (2026-09-09)

The previous system — a Visual FoxPro database that is no longer used — held **192 currently enrolled students**. `scripts/convert-old-students.ts` reads its student table directly and writes a CSV; `scripts/import-students.ts` sends each row through `POST /api/v1/students`, so every rule the admission form obeys applied, and all 188 admissions are in the audit log under the administrator who ran it. Nothing about the system itself was changed to accommodate the old data.

**188 students created, each with a portal login.** Counted back class by class against the old file, every one of the seventeen groups matches exactly, with three differences that are each accounted for:

| | old system | in the app | why |
|---|---|---|---|
| 1st Year / Boys / FA | 1 | 0 | M Ikram: his B-Form is the number already recorded for Rabia Parveen — a typo in the old system |
| 1st Year / Girls / FA | 10 | 9 | Umm E Ammara: the old record has no father's name |
| 1st Year / Boys / ICS Physics | 6 | 7 | the office's own "testing as student" record, which predates the import |

Two more rows were refused and should have been: **Fajar Zahra** and **Alina Gul** were entered by hand in August *and* exist in the old file — same father, same class, same B-Form. The system will not put one B-Form on two students, so it declined to duplicate them.

**The translation is written out rather than inferred.** `SECTION_MAP` turns each of the seventeen old class/section spellings — including `FA P2 | B0YS`, whose "BOYS" carries a zero — into a class, division, program, section and gender. A combination that is not in the map stops the run: a student landing quietly in the wrong class is worse than a failed conversion.

**A quarter of the board results were nearly lost.** The old file spreads a student's previous exam across three numbered slots and which one was used depended on who typed the record. Reading only the first, as the converter began by doing, dropped the result for 47 of the 192; checking one student's record against the file caught it. All three slots are read now, and the one that looks like matric wins: 118 results, 120 mark pairs and 139 roll numbers instead of 71, 71 and 93.

**Logins.** The importer asks the application to create each account, so the password is generated and hashed server-side and the account is marked *must change password*. Usernames follow the rule the admission form suggests — "Muhammad Ali" becomes `muhammad.ali`; of 188, five needed the admission number appended to stay unique. A temporary password exists in readable form exactly once, in the reply that creates it, so it is written to `student-logins.csv` and never to the terminal: printed, handed out, deleted. Both that file and the old `.DBF` files are ignored by git — they hold 192 families' B-Forms and addresses.

**Verified on the live database after the run**: 191 students, 191 enrolments, 188 imported and 188 with a login, every one of them active, student-role and must-change-password; no duplicate username, no duplicate admission number, no login left without a student, no unhashed password; 188 `student.created` and 188 `user.created` audit entries. Rehearsed first against a throwaway copy carrying the same academic structure, where three of the issued logins were used to sign in.

### 22.58 Phase 29, the handbook and the real logo (2026-09-11)

**Admin → Handbook** is the whole system explained, as a document. A cover, a contents page, seventeen parts and a closing page, printed one part to a sheet with the college's mark on every one. The office opens it and chooses **Save as PDF** in the browser's own print dialogue — the same way the result card and the fee voucher have always printed, so there is no PDF library and no headless browser, both of which were ruled out at the start.

**It is generated from the system, not written beside it.** Reprinting it after a change gives an accurate copy, rather than a file going quietly stale in somebody's downloads folder. Its words live apart from its layout, and a test reads them: it asserts the handbook still says fees are annual and paid in instalments, that money records are voided rather than edited, and that there are no student submissions and no student timetable. Reverse one of those decisions and the handbook fails its test instead of lying to whoever printed it.

**Every rule comes with its reason.** "A voucher with money against it cannot be cancelled" reads as an obstruction on its own; with "it would leave the payment pointing at nothing" it reads as care. The office is more likely to follow a rule it understands, and more likely to spot one that is genuinely wrong.

**The logo is the college's own at last.** The file supplied on 31 August had been sitting unused in the repository for a fortnight while the app drew a placeholder monogram. It is a wordmark in a wide white field, so `scripts/prepare-logo.ts` trims the white to transparency and writes two assets: the shield alone for small square placements, and the shield with the words for a page header. Sign-in, change password, switch portal, not found and the offline page now carry the full logo; the sidebar and the handbook's page headers carry the shield.

**Verified through the production build (7 new checks, 738 in total)**: the handbook renders cover to close, carries the college's own logo, explains the money rules it keeps, and keeps the print button off the paper; a teacher, a student and a signed-out visitor are each sent away from it.

**Tests: 13 new** — the cover, the contents, every part, where each lives, the rules and their reasons, the step lists, one sheet per part, and the print dialogue. **1,510 in total across 86 files.**

**One gap in the harness closed on the way.** A verifier that crashes while loading prints a stack and then no checks, and the run ended looking calm with only the exit code disagreeing — which is exactly how a whole verifier went missing from a run unnoticed while this was being built. The harness now ends with "All steps passed", or says how many failed and where to look.

### 22.7 What Phase 4 delivered

Student records and academic enrollment, built on the Phase 1–3 architecture. Nothing existing was rebuilt.

**Student list** (`/admin/students`) — server-side search (name, student ID, admission number, father's name, roll number), filters by session, class, division, program, section and status, sortable columns, pagination, and status tabs with live counts. Every academic filter is an id, so a new program filters correctly with no code change.

**Admission** (`/admin/students/new`) — a form grouped into Admission, Personal, Parent/Guardian, Previous education, Academic enrollment and Portal account. The student ID (`STU-0001`) and admission number (`ADM-00001`) come from the shared `code_sequences` counter through an atomic `UPDATE … RETURNING`; the browser never invents them.

**Cascading enrollment picker** — Session → Class → Division → Program → Section, where each dropdown offers only combinations that actually exist in the chosen session. The whole structure loads in one request, so choosing a class needs no extra round trip. Picking a level clears everything below it, so no stale combination can survive.

**Student profile** (`/admin/students/[id]`) — current enrollment, personal details, guardian, admission and previous education, the full academic history, the subjects from the curriculum, the linked portal account, and honest placeholders for Documents/Attendance/Exams/Results.

**Transfer** — moves a student to another section, program or division inside the same session. The old enrollment is closed as `TRANSFERRED` and a new one opened; both stay in the history.

**Promotion** — moves a student into a later session, explicitly and never automatically. The old year closes as `PROMOTED`, `REPEATED` or `COMPLETED`; completing the final year also sets the student to `GRADUATED`. The service refuses to "promote" into the same session, or backwards into an earlier one.

**Status lifecycle** — Active, Inactive, Left/Withdrawn, Graduated, Transferred out. Moving away from Active closes the current enrollment, which releases the roll number, while keeping every historical row. There is no delete endpoint at all.

**Portal account linking** — create a new student login from the profile, or while admitting. Authentication is untouched: it creates an ordinary `users` row through the same code as User Management, with a temporary password shown once. Unlinking removes only the connection; the account itself is kept.

**Security** — Student Management requires the ADMIN role in addition to the `students.*` permissions (ADR-058). Every one of the ten service functions carries the guard.

**Audit** — `student.created/updated/status_changed/account_linked/account_unlinked` and `enrollment.created/updated/transferred/promoted/closed`, with before/after placements and the reason. These also read properly on the dashboard's Recent Activity.

**Database** — one migration, `20260830000000_student_enrollment_history`, described in §22.8.

### 22.8 The Phase 4 migration

Until now the database allowed exactly **one enrollment row per student per session**, so a mid-year transfer could only be done by overwriting it — destroying the record of where the student had been.

The rule became **one _active_ enrollment per student per session, with unlimited closed historical rows**:

1. `TRANSFERRED` added to the enrollment status list.
2. The unique constraint on `(student_id, academic_session_id)` replaced by a partial unique index limited to `status = 'ACTIVE'`.
3. Roll numbers unique on `(section_id, roll_number)` among **active** enrollments only — so a roll number becomes free again when a student moves out of a section.
4. Supporting indexes on `(student_id, start_date)` and `roll_number` for history and search.

**Roll-number scope.** The requirement asked for uniqueness across session + class + division + program + section + roll. Because a section belongs to exactly one academic group, and a group *is* session × class × division × program, uniqueness per section is mathematically identical — but expressed in one column instead of five, so the two can never drift apart.

Safe on existing data: every enrollment that existed was already ACTIVE and unique per student+session. Applied to the college's Neon database with all Phase 1–3 records intact.

### 22.9 Phase 4 verification (2026-08-30)

Run against a real PostgreSQL engine with the application running. The college's Neon database received the migration only; all testing used a throwaway database.

| Check | Result |
|---|---|
| All three migrations apply to a clean database | ✅ |
| Migration applies to the live Neon database, Phase 1–3 data intact | ✅ |
| A second **active** enrollment in one session is rejected | ✅ |
| Transfer keeps both rows; roll number freed for reuse | ✅ |
| Duplicate active roll number in a section rejected; same roll in another section allowed | ✅ |
| Promotion keeps the closed row and opens the next year | ✅ |
| Enrolling into a section from another session still impossible | ✅ |
| 16/16 constraint checks | ✅ |
| **Staff** and **student** blocked from every student API and page | ✅ 403 / 307 |
| Admit a student: `STU-0001` / `ADM-00001` generated, placement correct | ✅ |
| Portal account created and linked in the same transaction | ✅ |
| Duplicate roll number → message naming the section and field | ✅ |
| Duplicate admission number → field-level message | ✅ |
| Section that does not belong to the chosen program → rejected | ✅ |
| Invalid CNIC format → rejected | ✅ |
| Search by name, student ID, admission number and roll number | ✅ |
| Filter by program before and after a transfer | ✅ counts moved 3→2 and 0→1 |
| Transfer Pre-Medical → Pre-Engineering: 2 history rows | ✅ |
| Promote into 2027-28 / 2nd Year: **3 history rows across both sessions** | ✅ |
| **Create program "I.Com" → appears in enrollment options → student admitted into it → filter works** | ✅ no code change |
| Account: link, prevent double-link, prevent duplicate username, unlink keeps the login | ✅ |
| Status → LEFT closes the enrollment, keeps history, frees the roll number | ✅ |
| All three pages render (list, add, profile) | ✅ |
| Audit entries readable on the dashboard | ✅ |
| `typecheck`, `lint`, `build` clean; **171 tests pass** (129 existing + 42 new) | ✅ |

One real security gap was found by running the app and fixed: staff hold `students.view` (designed in Phase 0 for a future *scoped* teacher view), so they initially received the full admin student list including guardian and CNIC fields. Student Management now requires the ADMIN role as well — see ADR-058.

### 22.5 What Phase 3 delivered

A real Admin Dashboard, built on the existing services, permissions, audit log and design system. No schema change was needed.

**One service, one place** — `getAdminDashboard(ctx)` in `dashboard.service.ts` gathers everything the dashboard shows. The page contains no database queries, and `GET /api/v1/dashboard` returns exactly the same figures.

**Sections**
- **Attention banners** — no current session, a session with no structure, or a structure with no curriculum. Each links to the screen that fixes it.
- **Overview tiles** — user accounts (with active/inactive), students, staff, sections.
- **Academic statistics** — classes, divisions, programs, subjects, academic groups.
- **Academic structure** — the current session read live from the database and nested Class → Division → Program → sections, with student counts.
- **Quick actions** — nine shortcuts, filtered against the administrator's effective permissions; every one points at a page that exists today.
- **People, Current session** — role breakdown, session dates and status, curriculum entries, enrolled students.
- **Recent activity** — the last 12 administrative changes from the audit log, as readable sentences.
- **Not built yet** — the eight unbuilt modules with their phase numbers.

**Honesty about missing modules.** Attendance, exams, results, documents and notices contribute no figures at all. They appear only in the "Not built yet" list with a phase badge. A zero would read as "no attendance was taken today", which would be false — the module does not exist.

**Empty states.** With no students and no staff the tiles read 0 with the explanation "None added yet — Phase 4/5", and no button offers to add one, because those screens do not exist yet.

**Performance.** All six user figures come from a single `GROUP BY role, status`. The eleven remaining counts are sent as one batched `$transaction` rather than eleven round trips — which matters against a hosted database where latency dominates. Nothing loads a whole table; every figure is a `COUNT` or aggregate. Measured response time against a live database: **0.11 s** average.

**Security.** The service requires `dashboard.view` and then the ADMIN role, so a staff member or student calling `/api/v1/dashboard` gets 403 even though they hold `dashboard.view` for their own portal. Each section is additionally gated: user figures need `users.view`, the structure needs `academics.view`, recent activity needs `audit.view`. An administrator missing one simply does not see that card.

**Audit safety.** Activity lines are assembled from the actor's name, a fixed phrase and the record label only. The `beforeData`, `afterData`, `metadata`, `ipAddress` and `userAgent` columns are never even selected from the database.

### 22.6 Phase 3 verification (2026-08-29)

Run against a real PostgreSQL engine with the application running. The college's Neon database was used read-only; Phase 3 required no migration.

| Check | Result |
|---|---|
| Student and staff `GET /api/v1/dashboard` | ✅ 403 |
| Signed-out `GET /api/v1/dashboard` | ✅ 401 |
| Student and staff `GET /admin` | ✅ 307 to their own portal |
| User statistics match the database | ✅ 4 users: 1 admin, 1 staff, 2 students |
| Academic statistics match | ✅ 2 classes, 2 divisions, 5 programs, 14 subjects, 20 groups, 20 sections |
| Structure tree matches the college's real structure | ✅ 2 classes × 2 divisions × 5 programs |
| **A new program (I.Com) appears with no code change** | ✅ programs 5→6, groups 20→21, listed under 1st Year · Girls |
| Recent activity shows the change that was just made | ✅ "admin added to the session structure 2026-27 · 1st Year · Girls · I.Com" |
| Admin with `audit.view` revoked | ✅ activity card hidden, page still loads |
| Admin with `users.view`/`users.manage` revoked | ✅ user figures and user shortcuts hidden, academic sections still shown |
| Revoking a critical permission from yourself | ✅ still refused (Phase 2 rule intact) |
| **Empty state: 0 students, 0 staff** (matching the live database) | ✅ zeros with "None added yet — Phase 4/5", no dead links |
| Sensitive-data scan of the API payload and rendered HTML | ✅ no passwords, hashes, tokens, snapshots, IPs, user agents or emails |
| Dashboard response time, 5 runs | ✅ 0.105–0.126 s |
| `typecheck`, `lint`, `build` clean; **129 tests pass** (101 existing + 28 new) | ✅ |

### 22.3 What Phase 2 delivered

Built entirely on the Phase 1 architecture — the authentication engine, permission catalogue, session handling and audit logger were reused, not rebuilt.

**Admin → User Management**
- User list with server-side search (name, username, email, linked profile), role and status filters including *Locked*, sortable columns, and pagination. Only one page of rows ever reaches the browser.
- Quick role tabs with live counts (All / Administrators / Staff / Students).
- Create account: full name, username, role, status, optional email, optional link to an existing staff or student record.
- Account detail page: full details, account actions, and the permission editor.

**Account lifecycle**
- **Create** — a secure temporary password is generated, hashed with Argon2id, and shown to the administrator exactly once. `mustChangePassword` is always set.
- **Reset password** — new temporary password, every session revoked, forced change on next sign-in.
- **Deactivate / activate** — deactivation deletes all sessions immediately, so the person is signed out within the same request. Nothing is deleted; reactivation also clears any lockout.
- **Unlock** — clears the temporary lockout caused by repeated wrong passwords.
- **Sign out everywhere** — revokes sessions without changing the password.
- **No deletion at all** — there is deliberately no DELETE endpoint for accounts.

**Roles and permissions**
- Role changes clear the person's individual overrides (chosen against the old role) and revoke their sessions, then are audited with the full before/after.
- Permission editor showing, for every permission: the **role default**, the **override** (Allow / Deny / Default) and the resulting **effective** permission. Grouped by module, using the existing 46-permission catalogue — no new permission definitions were introduced.
- Overrides that merely restate the role default are discarded, so a stored override always means a real exception.

**Safety rules** (pure, unit-tested functions in `src/server/services/user-safety.ts`)
- An administrator cannot deactivate their own account, change their own role, or revoke their own `users.view` / `users.manage` / `permissions.manage`.
- The last active administrator cannot be deactivated, demoted, or stripped of those critical permissions.
- The system-owner account is protected from all three.
- Role changes require typing the username to confirm.

**Audit** — `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.password_reset`, `user.role_changed`, `user.unlocked`, `user.sessions_revoked`, `permission.granted`, `permission.revoked`, `permission.override_removed`. Verified by scan that no password, hash or session token ever reaches the audit trail.

**Database** — one migration, `20260829000000_add_user_full_name`: a single nullable `users.full_name` column. An administrator has no staff or student profile, so there was previously nowhere to store their name. Where a profile *is* linked, that record's name stays authoritative, so the name is never duplicated. Applied to the college's Neon database with all existing data intact.

### 22.4 Phase 2 verification (2026-08-29)

Run against a real PostgreSQL engine with the application actually running, not by inspection. The college's Neon database was not used for testing; it received only the migration.

| Check | Result |
|---|---|
| Both migrations apply to a clean database | ✅ |
| Migration applies to the live Neon database, Phase 1 data intact | ✅ |
| Student: `/admin/users` → redirected; `GET`/`POST /api/v1/users` → 403 | ✅ |
| Staff: `/admin/users` → redirected; `GET`/`POST /api/v1/users` → 403 | ✅ |
| Signed out: `/api/v1/users` → 401 | ✅ |
| Create staff and student accounts; temporary password returned once | ✅ |
| Duplicate username rejected, including a different letter case | ✅ |
| Invalid role, username with spaces, oversized page, unknown sort column all rejected | ✅ |
| Search by name; filter by role; pagination across pages; sort by username | ✅ |
| New account signs in with the temporary password and is forced to change it | ✅ |
| Deactivate → existing session dies immediately → sign-in refused → reactivate → sign-in works | ✅ |
| Password reset → 4 sessions revoked → old password refused → new one works and forces a change | ✅ |
| Admin cannot deactivate self, change own role, or revoke own `users.manage` | ✅ |
| System owner cannot be deactivated, demoted, or stripped of `users.manage` by another admin | ✅ |
| `DELETE /api/v1/users/{id}` → 405, no such endpoint exists | ✅ |
| GRANT and REVOKE change the effective permission, and change real API access | ✅ |
| A redundant override is not stored; an unknown permission key is rejected | ✅ |
| Role change clears overrides and revokes sessions | ✅ |
| Audit trail records all 11 action types with actor and before/after | ✅ |
| Scan of every audit row for passwords, Argon2 hashes and session tokens | ✅ none present |
| `typecheck`, `lint`, `build` clean; **101 tests pass** (51 from Phase 1, 50 new) | ✅ |

Two real defects were found by running the application and were fixed:
1. The login response showed the username instead of the person's name, because `auth.service.ts` had its own copy of the display-name logic that was not updated alongside `session.ts`.
2. The user detail page returned HTTP 500: `formatDateTime` lived in a `'use client'` module, and a server component cannot call a client function. The date helpers moved to `src/lib/format.ts`, which both sides can use. Neither `typecheck` nor `build` catches this — only running the page does.

---

## 23A. Confirmed scope for phases 18-26 (added 2026-09-07)

The college asked for sixteen further features. **They begin after the
original roadmap (§20) is complete** -- Phase 17, deployment, is the last of
those. They are sequenced below by dependency: the two that change foundations
-- money, and more than one role per person -- come after the self-contained
ones, so a mistake in them cannot be carried into everything else.

| Phase | Feature | Notes |
|---|---|---|
| 18 | Attendance colour bands | **Done.** Below 75% red, 75-79 amber, 80-89 light green, 90-100 dark green |
| 18 | Teacher edits attendance | **Done.** Teachers correct their own submitted registers within an office-set window (Settings → Attendance rules; 7 days by default, 0 = office only); every correction audited (ADR-166) |
| 19 | Profile photos for students and staff | **Done.** The photo document makes a 128 px thumbnail kept in the database and served under the document rule; faces beside names everywhere (ADR-167) |
| 20 | Homework and assignments | **Done.** Set where a teacher is assigned, read by the section, files as documents (ADR-169). No student submissions — not asked for |
| 21 | Marks entry deadline | **Done.** `exams.marks_deadline`; after it the office reopens that one paper, for a stated reason, until a stated day (ADR-170) |
| 21 | Marks correction for teachers | **Done.** Their own submitted sheets, within the deadline; never a PUBLISHED sheet — a result was made from it (ADR-170) |
| 22 | Staff attendance | **Done.** The office's own daily register: Present, Absent, Short leave, Leave; approved leave is left out of the worked percentage, and each staff member sees their own month (ADR-171) |
| 23 | Complaints | **Done.** A student writes an application, the office answers it, and the exchange stays between the two of them — a teacher cannot read one even holding every permission (ADR-172) |
| 24 | A staff member who is also an admin | **Done.** One account, both portals, with a switcher; the portal they are in is the role they are, so a principal teaching is a teacher (ADR-173) |
| 25 | Fees | **Done.** Named packages, one per student with a concession on top, monthly vouchers with a due date, a flat late fine, and payments recorded against them — all in whole paisa (ADR-174) |
| 26 | Finance | **Done.** Expenses recorded and voided like fee payments, a month's income against its spending, and a year drawn as hand-made SVG (ADR-175) |
| 26 | Admin delete | **Done.** A student, staff member or account is erased only when nothing at all refers to it; otherwise the refusal names what stands in the way (ADR-175) |

### The four decisions behind them (confirmed 2026-09-07)

**Deleting people.** An admin may permanently delete a student, staff member or
account **only when nothing references it** -- no attendance, no marks, no
results, no documents. Where there is history the delete is refused with a
reason, and deactivation remains the answer. Nothing cascades: a published
result card must not stop existing because somebody tidied a list.

**Fee packages.** The admin creates named packages -- "1st Year Pre-Medical --
Regular", "Scholarship 50%" -- each with its own amount, and assigns one to each
student. A **per-student discount** sits on top, so an individual concession
never needs a package of its own.

**Billing.** **Monthly.** One voucher per student per month with a due date, and
a late fine, set by the admin, applied after it.

**More than one role.** A **staff member may additionally hold admin access**
and switch portals. Students stay single-role. This is deliberately the narrow
version: the wide one -- any user holding any combination -- would mean reworking
every authorization check in the system for a case the college does not have.

### Standing constraints these inherit

Money is counted in **integer paisa**, never floating point, exactly as marks are
counted in hundredths (ADR-105). Graphs are **hand-drawn SVG**; no chart library.
Every new permission goes through the existing catalogue, and the service layer
stays the only authorization boundary (ADR-008).

---

## 23. Extensibility notes for future features

| Future feature | Hook already in the design |
|---|---|
| A new level in the hierarchy (Shift: Morning/Evening; Campus) | Add the lookup table + one column on `academic_groups`; nothing below it changes |
| Section-specific subject deviations | Add `section_subject_overrides`; the curriculum lookup already goes through one service function |
| Elective / optional subjects | `curriculum_subjects.is_compulsory` is already there; add a `student_subject_choices` table |
| Parent portal | Add `PARENT` role + `parent_students` link table; scope rule "students linked to me"; permissions catalogue extends |
| Fees / payments | New `fees` module; `students`/`student_enrollments` are the anchors; audit ready |
| SMS / email / push notifications | `notices` already model audience; add a `notification_deliveries` table + provider abstraction like `StorageProvider` |
| Library / hostel / transport / inventory / payroll | Independent modules under `services/` + `features/`; share people & session tables |
| Certificates / ID cards | Report engine + `documents` (owner COLLEGE/STUDENT) |
| Assignments / online exams | `exam_types` is configurable; `exam_subjects` can gain a `mode` |
| Messaging | New module; permission keys |
| Analytics / AI insights | Read-only over attendance/results tables; keep data clean now |
| 2FA (TOTP) | `users` gains `totp_secret`; login flow has a clear extension point |
