# Kabirian College Management System — Project Plan

| | |
|---|---|
| **Status** | **Phase 8 complete, plus the official result card in its final form.** Google Drive stays connected (`kabiriancollege@gmail.com`, folders created, live connection test passing). The whole examination cycle now works: exam types, exams, papers and date sheets; teacher marks entry; result generation, review and publication; and the student and staff result portals. A printable official result card is now available to students from their own result page. PDF generation, exports and notifications are not built. Awaiting confirmation for the next phase. |
| **Last updated** | 2026-08-31 (rev. 23 — the result card restyled as a college document) |
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
| Hosting (provisional) | Next.js **standalone build in Docker** on Railway / Render / a VPS; Neon Postgres | Document uploads need request bodies > 4.5 MB, which rules out Vercel's serverless functions unless we cap uploads at 4 MB. Final choice in Phase 17. |

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
| Service worker | Serwist (`app/sw.ts`), registered after load; "New version available — Reload" prompt on update. |
| Caching strategy | `/_next/static/**` (hashed): precache + CacheFirst · fonts/icons/logo: CacheFirst (30 d) · HTML navigations: NetworkFirst → offline fallback page · **`/api/**`: NetworkOnly — never cached by the SW** (sensitive, per-user). Document content relies only on the browser's private HTTP cache. |
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
| Storage | `InMemoryStorageProvider` | Upload/replace/delete flows without touching Drive; one opt-in real-Drive smoke test |
| E2E | Playwright | Login → portal flows on mobile & desktop viewports; attendance marking; marks entry; PWA manifest/SW checks; Lighthouse PWA audit |
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

- [ ] Argon2id, DB sessions, HttpOnly/Secure cookies, sliding expiry, revocation
- [ ] Rate limiting + lockout on login; generic errors
- [ ] `authorize()` + scope check in **every** service function; matrix tests
- [ ] Role-based DTO projection (staff never receive CNICs)
- [ ] IDOR tests for every `/{id}` endpoint
- [ ] Zod on every input; magic-byte sniffing on every upload; size limits
- [ ] Drive IDs & credentials server-only; no public sharing; proxy downloads
- [ ] Encrypted refresh token; env-only secrets; `.env` git-ignored; secret scanning in pre-commit
- [ ] Security headers (CSP, HSTS, frame, referrer, permissions)
- [ ] Audit log for all sensitive actions; audit visible to Admin only
- [ ] Dependency audit (`npm audit`) in CI; pinned versions
- [ ] TLS to DB; DB encrypted at rest (Neon); least-privilege DB user
- [ ] Backups: DB automated (PITR) + periodic Drive export script; restore drill before go-live
- [ ] Logging redaction of PII

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
| Hosting body-size limits (Vercel 4.5 MB) | Medium | Deploy as a Node container (Railway/Render/VPS) or cap uploads at 4 MB — decided in Phase 17 |
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

**Current phase:** 9 — the official result card is done and styled. Awaiting confirmation for what comes next.

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
| 9 – 17 | ⏳ Not started | Next: fees |

**Live database:** the college's Neon PostgreSQL instance is connected and holds the real academic structure (2026-27, 20 groups, 20 sections). All **eight** migrations are applied to it, along with the reference data (12 designations, 10 departments, **8 document types**, and the confirmed **grading scale**).

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
