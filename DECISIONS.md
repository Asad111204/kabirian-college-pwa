# Architecture Decision Records — Kabirian College Management System

Each record: **Context** (the problem) → **Decision** → **Alternatives considered** → **Consequences**. Status is `Accepted`, `Proposed` (needs your confirmation) or `Superseded`.

Newest decisions are appended at the end. When a decision changes, the old record is marked `Superseded by ADR-xxx` — never deleted — so future developers understand the history.

---

## ADR-001 · Next.js (App Router) as a single full-stack framework

**Status:** Accepted · 2026-08-28

**Context.** We need a web UI, a secure server API, server-side authorization and a PWA. The developer is a beginner; the fewer independent systems to install, run and deploy, the better.

**Decision.** One Next.js project (App Router, Node runtime) provides pages, API route handlers and server-side rendering.

**Alternatives.**
- *React (Vite) SPA + separate Express/NestJS API* — clean separation, but two projects, two deploys, CORS, duplicated types. More to learn and maintain.
- *SvelteKit / Nuxt* — good, but smaller component ecosystem (shadcn/ui, TanStack) and fewer learning resources.
- *Plain server-rendered app (Django/Laravel)* — strong for CRUD, weaker for an installable, app-like PWA experience with rich interactive screens (attendance grid, marks grid).

**Consequences.** One repo, one `npm run dev`, one deploy artefact. We must keep server-only code in `src/server/**` (guarded with `import 'server-only'`) so secrets never reach the browser bundle.

---

## ADR-002 · TypeScript in strict mode everywhere

**Status:** Accepted

**Context.** A beginner benefits enormously from the compiler telling them what a function expects. Security bugs frequently hide in "it's probably a string" assumptions.

**Decision.** `strict: true`, no `any` in application code, Zod for runtime validation at the boundaries.

**Consequences.** Slightly more typing up front; far fewer runtime surprises; refactors are safe.

---

## ADR-003 · PostgreSQL as the system of record, hosted on Neon

**Status:** Accepted (host choice: Proposed — see Q6 in PROJECT_PLAN.md)

**Context.** Academic data is relational (students ↔ enrollments ↔ sessions ↔ attendance ↔ marks) and needs real constraints, transactions and reporting queries. The dev machine has no Docker and no local database.

**Decision.** PostgreSQL. Neon serverless Postgres for development (free tier, a `dev` branch) and production (separate project/branch with point-in-time recovery). Local PostgreSQL install documented as an alternative.

**Alternatives.**
- *MySQL/MariaDB* — fine, but Postgres has better JSONB, partial indexes, `DATE` handling and richer constraint support.
- *SQLite* — great for prototypes; not appropriate for a multi-user, hosted production system with backups/PITR needs.
- *Supabase* — also Postgres, but bundles its own auth/storage/RLS story that would compete with our design and confuse a beginner.
- *Google Drive / JSON files / localStorage* — explicitly rejected by the requirements; not databases.

**Consequences.** Development needs internet for the database (acceptable); production gets automatic backups.

---

## ADR-004 · Prisma ORM with versioned migrations

**Status:** Accepted

**Context.** We need type-safe database access, a readable schema definition, migrations and an easy way to inspect data.

**Decision.** Prisma ORM (latest stable at Phase 1; version pinned). Schema in `prisma/schema.prisma`; migrations committed; Prisma Studio for inspection. Hand-written SQL is added to migration files where Prisma's schema language cannot express something (partial unique indexes, `NULLS NOT DISTINCT`, check constraints).

**Alternatives.**
- *Drizzle ORM* — excellent and closer to SQL; slightly steeper for a beginner, less tooling (no Studio-grade GUI historically).
- *Raw SQL / Kysely* — maximum control, but more boilerplate and more chances to make mistakes.

**Consequences.** Fast, readable data layer. We must remember that Prisma's `unique` treats NULLs as distinct — enforce those cases in services and with raw-SQL indexes.

---

## ADR-005 · Custom database-backed session authentication (no auth library)

**Status:** Accepted

**Context.** Requirements: admin-provisioned accounts (no sign-up), username login (students often lack email), temporary passwords with forced change, instant deactivation, per-user permission overrides, audit of logins. Popular libraries are optimised for self-signup + OAuth + email-centric flows.

**Decision.** Implement authentication ourselves, following the well-documented "Lucia" patterns:
- Argon2id password hashing (`@node-rs/argon2`; `bcryptjs` fallback if the native binary fails to install on Windows).
- 256-bit random session tokens; **only the SHA-256 hash stored** in `sessions`; `HttpOnly; Secure; SameSite=Lax` cookie; sliding expiry (30 days); explicit revocation.
- Rate limiting + lockout on login; `Origin` check for CSRF on state-changing requests.
- Password reset is admin-initiated in v1; email-based reset added when an email provider exists.

**Alternatives.**
- *Auth.js (NextAuth v5)* — credentials provider forces JWT sessions (deactivation is not immediate without extra DB lookups), awkward for username login and forced-password-change flows.
- *better-auth* — strong modern option (email/password, DB sessions, admin plugin). Kept as the **fallback** if custom auth proves burdensome. Would add its own tables and conventions.
- *Clerk/Auth0* — hosted SaaS; cost, external dependency and PII leaving our control for a college system.

**Consequences.** ~300 lines of security-critical code that we own, test thoroughly (Phase 2 test suite) and review in Phase 14. Gains: exact fit to the college's workflows, instant revocation, no vendor churn.

---

## ADR-006 · Username-based login; email optional

**Status:** Accepted · implemented in Phase 1 (2026-08-29)

**Context.** Many students have no reliable email; codes like `STU-0001` are printed on ID cards; admins manage accounts centrally.

**Decision.** `users.username` (case-insensitive unique) is the login identifier; default username for students/staff is their code. `email` is optional and unique when present (used later for email-based reset/notifications).

**Consequences.** No email infrastructure needed for v1. Password resets go through the admin office (audited).

---

## ADR-007 · Permission model: role defaults + per-user overrides

**Status:** Accepted

**Context.** Three roles are required now, but the college will want exceptions ("this teacher may correct submitted attendance") without inventing new roles.

**Decision.** Tables `permissions` (catalogue), `role_permissions` (defaults per role) and `user_permissions` (`GRANT`/`REVOKE` overrides). Effective permissions = role defaults + grants − revokes, resolved once per request into `AuthContext.permissions`.

**Alternatives.** *Hard-coded role checks* (`if (role === 'ADMIN')`) — simple but unscalable and scattered. *Full custom roles table* — more flexible than needed now; can be added later without breaking this model.

**Consequences.** Granular permissions can be added by inserting rows. Scope (which records) is still enforced in services — permissions answer "may they do X", scope answers "to which rows".

---

## ADR-008 · The service layer is the only authorization boundary

**Status:** Accepted

**Context.** Client-side route guards and framework middleware can be bypassed (e.g. CVE-2025-29927 in Next.js middleware). Authorization must live where the data is accessed.

**Decision.** Every service function receives an `AuthContext` and calls `authorize()` (permission) and a scope assertion before touching data. Pages, API handlers, scripts and tests all go through services. `proxy.ts` only performs coarse redirects for UX.

**Consequences.** Adding a page can never accidentally expose data. Authorization is unit-testable independent of HTTP. Slight discipline cost: no Prisma calls outside `src/server/services`.

---

## ADR-009 · API surface = REST-style Route Handlers under `/api/v1`; no Server Actions in v1

**Status:** Accepted

**Context.** Beginners benefit from one explicit, testable API surface. Server Actions are convenient but every exported action silently becomes a public endpoint, and they are harder to test/audit as an API.

**Decision.** Mutations and client-side data fetching use route handlers (`src/app/api/v1/**`) wrapped in `withAuth()`. Server Components render initial page data by calling services directly (same authorization). Server Actions may be adopted later for simple forms once the team is comfortable.

**Consequences.** Clear request/response contracts, easy Playwright/Vitest API tests, a natural base for a future mobile app or parent portal.

---

## ADR-010 · Google Drive access mode: OAuth refresh token (default) or Service Account + Shared Drive

**Status:** Proposed (Q1)

**Context.** Files must live in Google Drive, owned by the college, never public. Google blocks service accounts from uploading into their own "My Drive" storage (since April 2025), so the classic "service account + shared folder in a Gmail account" pattern is **not viable**.

**Decision.** Support two modes behind the same provider, selected by `GOOGLE_STORAGE_MODE`:
- **`oauth`** (default; works with any Google account): one-time admin consent, refresh token stored **encrypted (AES-256-GCM)** in `settings`, scope `drive.file` (least privilege — app sees only files it created). OAuth app must be in "Production" publishing status so the token does not expire after 7 days.
- **`service_account`** (requires Google Workspace): service-account key in env, added as Content manager to a Shared Drive. No user token to expire; organisation-owned files.

Recommendation: `service_account` if the college has or can obtain Workspace (Education edition is free for eligible institutions); otherwise `oauth` on a dedicated college Google account with 2FA and recovery options.

**Consequences.** Setup steps differ (documented in `docs/GOOGLE_DRIVE_SETUP.md` in Phase 6). A health check + "Reconnect Drive" flow is required for the OAuth mode.

---

## ADR-011 · Drive folder layout: one folder per person, no per-type sub-folders

**Status:** Accepted

**Context.** The requested layout nests a sub-folder per document type inside each student/staff folder. Evaluated against security, organisation, performance, scalability, searchability, backup and maintainability (see PROJECT_PLAN.md §9.4).

**Decision.** `Kabirian College/Students/STU-0001/` and `Kabirian College/Staff/STF-0001/` with self-describing file names (`STU-0001_FATHER-CNIC_20260828-1532.pdf`). Person folders are created lazily on first upload and their IDs cached in `students.drive_folder_id` / `staff.drive_folder_id`. Top-level folders (`Students`, `Staff`, `Notices`, `Events`, `College-Documents`) are created once by a setup script; IDs stored in `settings`.

**Alternatives.** *Per-type sub-folders* — 5× more folders and API calls, no security or lookup benefit (the app opens files by ID). *Completely flat* — hard for humans to browse/back up.

**Consequences.** 1 folder API call per person instead of 6; human-browsable; the DB remains the only index. Folder layout can change later without touching file IDs.

---

## ADR-012 · Document metadata in Postgres, bytes in Drive, provider abstraction, IDs never exposed

**Status:** Accepted

**Context.** Requirement 14/15: metadata in the DB, file in Drive, replaceable provider, strict access control.

**Decision.**
- `documents` table holds owner (nullable FKs to student/staff/notice/event), `document_type_key`, `storage_provider`, `storage_file_id`, `storage_folder_id`, safe + original file names, MIME, size, SHA-256, status (`UPLOADING/ACTIVE/NEEDS_REPLACEMENT/REPLACED/DELETED/FAILED`), uploader, timestamps, `replaced_by_document_id`.
- `StorageProvider` interface (`ensureFolder / upload / download / delete / healthCheck`); `GoogleDriveProvider` in production, `InMemoryStorageProvider` in tests.
- Clients only ever receive `documents.id`; all reads go through `GET /api/v1/documents/{id}/content`, which authorizes and streams from Drive. No Drive sharing/links are ever created.

**Consequences.** Swapping to S3/local disk means implementing one interface. Every document access is authorized and auditable. Cost: each view is proxied through our server (mitigated by private browser caching and DB thumbnails, ADR-013).

---

## ADR-013 · Small photo thumbnails stored in PostgreSQL

**Status:** Accepted

**Context.** Lists of students/staff show photos; proxying full-size images from Drive for every row would be slow and quota-hungry. The requirement allows storing binaries in the DB "if there is a specific reason".

**Decision.** On photo upload, generate a ≤ 10 KB WebP thumbnail with `sharp` and store it in `students.photo_thumbnail` / `staff.photo_thumbnail` (`bytea`). Full-size original stays in Drive. Served via `GET /api/v1/students/{id}/photo` (authorized, cacheable privately).

**Consequences.** Fast, quota-free lists. A few MB of DB storage for thousands of people — negligible.

---

## ADR-014 · Replace/delete policy for documents

**Status:** Accepted

**Context.** Replacing a blurry CNIC scan must not lose the audit trail; deleting must be recoverable.

**Decision.** Replace = new Drive file + new `documents` row; previous row → `REPLACED` with `replaced_by_document_id`; previous Drive file moved to Drive trash (30-day recovery) or kept, per `DOCUMENT_REPLACE_POLICY`. Delete = row → `DELETED`, file → trash, audit entry. Permanent purge is a separate explicit admin action. Admin can flag a document `NEEDS_REPLACEMENT` with a reason, which shows in the checklist.

**Consequences.** Full history in the DB; storage growth bounded by the trash policy.

---

## ADR-015 · Attendance modelled as sheets + entries, per subject period

**Status:** Proposed (Q2)

**Context.** Requirement: teacher selects class → section → subject → date, marks students, submits; duplicates must be prevented; corrections audited.

**Decision.** `attendance_sheets` (**section** + subject + date, session, marked_by, status `DRAFT/SUBMITTED`, unique on section+subject+date) and `attendance_entries` (sheet, student, status `PRESENT/ABSENT/LEAVE`, unique on sheet+student; denormalised student/session/section/subject/date for fast reports). Class, division and program are reached through `section → academic_group`, so no extra columns and no chance of them disagreeing (ADR-031).

**Alternatives.** *Single flat `attendance` table* — simpler but duplicate prevention and "submit as a unit" semantics are weaker. *Once-per-day attendance* — supported later via a nullable `subject_id` + `period` column if the college wants it (Q2).

**Consequences.** Clean submission workflow, database-guaranteed uniqueness, efficient student/subject/month aggregates.

---

## ADR-016 · Exams are session-wide; papers are per class × subject; eligibility is derived from the curriculum

**Status:** Accepted · **Revised 2026-08-28** (see ADR-031)

**Context.** A real exam ("Midterm Nov 2026") spans many classes; each class has its own subject papers with different max/passing marks. With programs in the model, the same 1st Year exam must give Biology to Pre-Medical students and Computer Science to ICS students — without the admin creating a paper per division, per program and per section.

**Decision.** `exams` (session, type, dates, status) → `exam_subjects` (**class + subject**, date/time, max, passing) → `marks` (per student). **Who sits a paper is derived, not stored:** a student is eligible when their active enrollment's group has that class *and* the subject appears in `curriculum_subjects` for that group's `(session, class, program)`. So one "1st Year · Biology · 100 marks" paper automatically covers Boys and Girls Pre-Medical and every section, while ICS students never see it. `results` (one per exam+student) stores totals, percentage, grade, outcome, optional position, snapshots of `section_id` + `academic_group_id`, and a JSONB `subject_breakdown` with a `version` counter; `is_published` gates student visibility. Correcting published marks requires unpublish → regenerate → republish (audited).

**Alternatives.** *A paper per class × program × section* — 20× more rows to create and keep consistent, with identical max marks. *A `program_id` column on every paper* — kept as a documented extension point for the day a program needs different max marks for the same subject.

**Consequences.** Admin creates ~6–8 papers per class per exam instead of dozens. Historical result cards remain exactly as published even if the grade scale changes later.

---

## ADR-017 · Configuration as data: exam types, grade scales, document types, settings

**Status:** Accepted

**Context.** Requirements ask not to hard-code exam types, allowed file types, sizes, or grading.

**Decision.** Tables `exam_types`, `grade_scales` + `grade_bands`, `document_types` (required flag, allowed MIME list, max size), and a `settings` key/value (JSONB) table for toggles such as ranking on/off, leave-counts-as-present, current session. All admin-editable with audit.

**Consequences.** Behaviour changes without deployments; seed scripts provide sensible defaults.

---

## ADR-018 · Soft delete for people; history is never physically deleted

**Status:** Accepted

**Context.** Students/staff who leave must remain in historical results, attendance and audit logs.

**Decision.** `students`/`staff` have `deleted_at` and lifecycle statuses (`ACTIVE/INACTIVE/LEFT/GRADUATED/TRANSFERRED_OUT`). Physical deletion is only permitted for records with no dependent history (e.g. a student created by mistake with no enrollment data) and is audited.

**Consequences.** Queries filter `deleted_at IS NULL` by default (encapsulated in services).

---

## ADR-019 · UUID v7 primary keys plus human-readable codes

**Status:** Accepted

**Context.** IDs appear in URLs; sequential integers invite guessing and make IDOR easier to probe; random UUID v4 fragments B-tree indexes.

**Decision.** UUID v7 for all primary keys; `STU-0001` / `STF-0001` codes from a `code_sequences` table (row-locked in a transaction) for humans, ID cards and Drive folder names.

**Consequences.** Non-guessable, time-ordered keys; codes remain stable and printable.

---

## ADR-020 · Time zone and date handling

**Status:** Accepted

**Context.** Attendance dated on the wrong day is a classic bug when servers run in UTC.

**Decision.** `APP_TIMEZONE=Asia/Karachi`. Attendance dates, exam dates, DOB, joining dates are `DATE` columns. Timestamps (`created_at`, `published_at`) are `timestamptz`. "Today" is always computed in the college time zone on the server (`date-fns-tz`/`Intl`).

**Consequences.** Deterministic dates regardless of server location; tests around midnight boundaries.

---

## ADR-021 · PWA with Serwist; the service worker never caches API responses; no offline writes in v1

**Status:** Accepted

**Context.** The app must be installable and resilient, but attendance, marks and documents are sensitive and must not be stored on shared devices; offline queuing invites conflicts.

**Decision.** `@serwist/next` service worker: precache app shell and hashed assets; CacheFirst for fonts/icons; NetworkFirst for navigations with an offline fallback page; **NetworkOnly for `/api/**`**. Offline banner + disabled submit buttons with explanation. Background-sync queues and push notifications are deferred.

**Alternatives.** *next-pwa* — unmaintained. *Hand-written SW* — more control, more risk for a beginner. *Aggressive offline caching of user data* — conflicts with security requirements.

**Consequences.** Honest offline story: UI works, data needs network. Can be extended later with encrypted per-user read caches if ever required.

---

## ADR-022 · Tailwind CSS + shadcn/ui design system

**Status:** Accepted

**Context.** Need a modern, consistent, accessible, mobile-first UI without a heavy component framework lock-in.

**Decision.** Tailwind for styling; shadcn/ui components copied into `src/components/ui` (we own the code); design tokens (colours, radius, spacing) in `globals.css`; placeholder for the official logo.

**Alternatives.** *MUI / Ant Design* — heavier bundles, harder to make look bespoke. *Pure CSS modules* — slower to build a consistent system.

**Consequences.** Fast development of tables, dialogs, drawers, toasts; consistent look; easy theming when the official brand assets arrive.

---

## ADR-023 · Zod schemas shared between client and server

**Status:** Accepted

**Context.** Requirement 40: validate on both sides; never trust the client.

**Decision.** One schema per input type in `src/validation/**`, used by react-hook-form on the client and by route handlers on the server. Domain rules that need database context (uniqueness, cross-table checks) live in services.

**Consequences.** No drift between what the form allows and what the server accepts.

---

## ADR-024 · Testing: Vitest + Playwright, in-memory storage provider, authorization matrix as a first-class suite

**Status:** Accepted

**Context.** The most important tests are the ones proving Student A cannot read Student B and staff cannot reach unassigned sections.

**Decision.** Vitest for unit + integration (services against a test database); Playwright for E2E on mobile and desktop viewports and PWA checks; `InMemoryStorageProvider` so tests never touch Google Drive; an `authorization.matrix.test.ts` that grows with every module.

**Consequences.** Regressions in access control fail CI, not production.

---

## ADR-025 · Hosting as a long-running Node container (provisional)

**Status:** Proposed (final in Phase 17)

**Context.** Document uploads (scanned PDFs) can exceed the 4.5 MB request-body limit of Vercel serverless functions.

**Decision (provisional).** Build Next.js in `standalone` mode into a Docker image and deploy to Railway, Render or a VPS (e.g. Hetzner + Coolify); Neon for Postgres. Vercel remains viable only if the max upload is capped at 4 MB.

**Consequences.** Configurable upload limits (10 MB default), predictable costs, simple `Dockerfile`.

---

## ADR-026 · npm as the package manager

**Status:** Accepted

**Context.** npm 11 is already installed; pnpm is not. Avoid extra setup for a beginner.

**Decision.** npm with a committed `package-lock.json` and exact-version pinning for core dependencies.

**Consequences.** Slightly slower installs than pnpm; zero extra tooling.

---

## ADR-027 · Audit logging from Phase 2, inside service transactions, with before/after snapshots

**Status:** Accepted

**Context.** Requirement 29 and the need for corrections (attendance/marks) to be traceable.

**Decision.** `audit_logs` (actor, action `module.verb`, entity type/id/label, `before_data`, `after_data`, `metadata`, IP, user agent, timestamp). The audit helper is called by services within the same database transaction as the change, so a change without its audit entry cannot exist. PII fields are stored as-is (the log is admin-only) but never in server logs.

**Consequences.** Every later module logs consistently from its first commit; audit viewer UI arrives in Phase 14.

---

## ADR-028 · Role-based DTO projection for sensitive fields

**Status:** Accepted

**Context.** Staff need to see their students' names and roll numbers, not CNICs or home addresses.

**Decision.** Services return role-specific DTOs (`StudentFullDto` for admin/self, `StudentLimitedDto` for staff). Sensitive fields (`cnic_bform_number`, `father_cnic`, address, documents) are only present in the full DTO, and viewing them by admins with a dedicated `documents.view_sensitive`/`students.view` permission is audited for document access.

**Consequences.** Privacy by construction; tests assert the limited DTO never contains sensitive keys.

---

## ADR-029 · No self-registration; admin-provisioned accounts with temporary passwords

**Status:** Accepted

**Context.** A college controls who its users are; open sign-up would be a security hole.

**Decision.** Accounts are created by Admin (individually or in bulk from student/staff records). A generated temporary password is shown once; `must_change_password` forces a change on first login. Admin can reset/deactivate at any time; all audited.

**Consequences.** No email verification flows needed in v1; onboarding handled by the college office.

---

## ADR-030 · Seed data policy

**Status:** Accepted

**Context.** Requirement 47: no fake production data.

**Decision.** Two separate seed scripts: `seed:reference` (permissions, document types, exam types, default grade scale, settings, **and Kabirian's real academic building blocks — classes, divisions, programs — confirmed by the college**, all editable afterwards; safe for production) and `seed:dev` (clearly labelled demo college with fake students/staff — refuses to run when `NODE_ENV=production` or when the database already contains real students). First admin account is created by an interactive `scripts/create-admin.ts`. The first session's *structure* (groups + sections) is created by the admin in the Session Structure screen, or by a one-time `scripts/bootstrap-structure.ts` reading a small JSON config — real configuration, not demo data.

**Consequences.** Realistic local testing without ever polluting production; a new install already knows what "1st Year Boys Pre-Medical" means without any code containing those words.

---

## ADR-031 · Academic structure: reusable building blocks + session-scoped `academic_groups`, instead of literally nested Class → Division → Program tables

**Status:** Accepted · 2026-08-28

**Context.** Kabirian College is organised as Class (1st/2nd Year) → Division (Boys/Girls) → Program (Pre-Medical, Pre-Engineering, ICS Physics, ICS Economics, FAIT) → Section → Students: 2 × 2 × 5 = 20 combinations per session today. The requirement is explicit that none of this may be hard-coded, that Admin must manage every level, that multiple sections per combination must be possible, and that a future session may have a different structure.

**Decision.**
- **Building blocks** — `classes` (with a numeric `level` for promotion), `divisions`, `programs`, `subjects` — are independent lookup tables, each concept stored **once** and reused by every session.
- **`academic_groups`** = one row per `(session, class, division, program)` that actually exists. This is the 20-row table for 2026-27, and the single place where "which combinations run this year" is recorded.
- **`sections`** belong to a group (`A`, `B`, …) and are the operational unit: students enroll into a section, teachers are assigned to a section, attendance sheets and timetable slots belong to a section.
- **`curriculum_subjects`** = subjects per `(session, class, program)` — 10 lists today. A section's subjects are derived from its group; Boys and Girls of the same program share one list, as do sections A and B.
- Reading a section upwards (`section → academic_group → class/division/program/session`) reproduces the full hierarchy exactly as the user describes it, and the UI presents that path unchanged.

**Alternatives.**
1. *Four physically nested tables (`class_divisions` → `division_programs` → `sections`)* — matches the wording literally, but stores "Pre-Medical" four times per session (per class per division); renaming or deactivating it means finding every copy, and next session duplicates them all again. Cross-cutting queries ("all Pre-Medical students") must join four levels and trust that names match.
2. *A single wide `sections` table with `class_id`, `division_id`, `program_id` columns* — no duplication of names, but nothing records that a group **exists** independently of having a section, "copy last year's structure" has no object to copy, and every child table would need three columns instead of one to know where it sits.
3. *Composite text keys like `"1Y-B-PM-A"`* — unnormalized, unqueryable, breaks on rename.

Option 1 was rejected for duplication and drift, option 2 for losing the group as a first-class object, option 3 outright.

**Consequences.**
- Renaming a program is one row; adding "3rd Year", a third division or a new program is data entry; a discontinued program is deactivated without touching history.
- Adding a whole new level later (Shift = Morning/Evening, or Campus) means one lookup table + one column on `academic_groups` — nothing below changes.
- Child tables carry only `section_id` (+ a denormalised `academic_session_id` for composite FKs), so a student's class/division/program can never disagree with their section.
- Cost: one extra join to display "1st Year · Boys · Pre-Medical". Absorbed by a `sectionWithGroup` service helper and covering indexes; report queries filter directly on `academic_groups.program_id` / `division_id`.
- The word "group" is internal plumbing; the UI keeps the college's own vocabulary (Class, Division, Program, Section).

---

## ADR-032 · Enrollment points at a section only; class/division/program are never copied into it

**Status:** Accepted · 2026-08-28

**Context.** A student's academic placement must be historically accurate, must survive renames, and must support moving section or program mid-session as well as promotion between sessions.

**Decision.** `student_enrollments` = `(student_id, academic_session_id, section_id, roll_number, status, dates)`, unique per `(student_id, academic_session_id)`. Class, division and program are read through the section's group and never duplicated on the row. Movement inside a session updates `section_id` (audited, including a program-change warning when the curriculum differs). Movement to a new session **inserts a new row**; the old one is closed as `PROMOTED` / `REPEATED` / `COMPLETED` / `LEFT` and keeps pointing at the old section forever.

A composite foreign key `(section_id, academic_session_id) → sections(id, academic_session_id)` makes it structurally impossible to enroll a student into a section from a different academic session.

**Alternatives.** *Snapshotting class/division/program onto the enrollment* — protects against structural edits, but creates two sources of truth that silently diverge on a rename; rejected because sessions are closed (frozen) rather than rewritten, and because attendance/results already snapshot what they need. *Overwriting the enrollment on promotion* — explicitly forbidden by the requirements: it would erase history.

**Consequences.** Full academic history per student ("2026-27: 1st Year Boys Pre-Medical A → 2027-28: 2nd Year Boys Pre-Medical A"), with attendance, marks and results still attached to the correct year. Promotion is an insert, never an update, so it is safe to re-run and easy to audit.

---

## ADR-033 · Curriculum defined per class × program (not per section, not globally)

**Status:** Accepted · 2026-08-28

**Context.** "Different programs may have different subjects — do NOT create one universal hard-coded subject list." Pre-Medical studies Biology; ICS Physics studies Computer Science and Physics; FAIT differs again. Boys and Girls of the same program study the same subjects, and so do sections A and B.

**Decision.** `curriculum_subjects (academic_session_id, class_id, program_id, subject_id, is_compulsory, sort_order)` — 10 lists for Kabirian today (2 classes × 5 programs). A section's subject list is **derived** from its group's class + program. The curriculum drives: which subjects a teacher may be assigned to, which exam papers a student sits, what the timetable may schedule, and the row order on result cards.

**Alternatives.** *Per section* (`section_subjects`) — 20+ near-identical lists per session, guaranteed to drift when someone edits one. *Per student* — correct only when electives exist; premature and heavy today. *Global subject list* — explicitly rejected by the requirements.

**Consequences.** Editing "Pre-Medical studies Biology" is one row and applies to Boys, Girls and every section at once. Two documented extension points, neither requiring a redesign: `section_subject_overrides` if a single section ever deviates, and `student_subject_choices` (with `is_compulsory = false`) when electives are introduced.

---

# Phase 1 decisions (2026-08-29)

## ADR-034 · Free and open-source by default; nothing in the stack requires payment

**Status:** Accepted · 2026-08-29

**Context.** The college asked that operating and development costs stay as low as possible, without sacrificing security, reliability or data integrity.

**Decision.** Every dependency chosen is free and open source (MIT/Apache/BSD), and the whole system can be developed and first deployed at zero cost:

| Need | Choice | Licence / cost |
|---|---|---|
| Framework, UI, forms | Next.js, React, Tailwind, Radix primitives, lucide-react, sonner | MIT — free |
| Database | PostgreSQL; **Neon** free tier for development and first production use | Open source; free tier |
| ORM | Prisma | Apache-2.0 — free |
| Authentication | Our own code + `@node-rs/argon2` | MIT — free, no per-user fees |
| Validation, testing, tooling | Zod, Vitest, ESLint, Prettier | MIT — free |
| Images | sharp | Apache-2.0 — free |
| File storage | Google Drive (Phase 6) — the college's existing account | Free within its quota |
| Hosting (Phase 17) | Railway / Render / Fly.io free-or-cheap tier, or a small VPS | Free to a few dollars a month |

Rejected on cost grounds where a free option was equally good: hosted authentication (Clerk, Auth0 — per-user pricing, and student PII leaving the college's control), hosted error monitoring for now, and paid UI kits.

**Where money may eventually be needed — stated plainly:**
- Neon's free tier is generous but has storage and compute limits; a few thousand students with years of attendance will eventually justify a paid tier (single-digit dollars a month) or a self-hosted PostgreSQL.
- A hosting free tier usually sleeps when idle, which makes the first request of the day slow. A small paid plan or a VPS fixes that.
- A custom domain name costs a little each year.
- Google Drive is free up to 15 GB on a personal account; a Workspace plan (or Workspace for Education, free for eligible institutions) is worth considering when document volume grows.

None of these are needed to build or to trial the system.

**Consequences.** No vendor lock-in and no surprise bills. The paid options are upgrades of the same components, not rewrites.

---

## ADR-035 · Phase 1 scope expanded to include authentication and Academic Management

**Status:** Accepted · 2026-08-29 · supersedes the phase split in PROJECT_PLAN.md §18 for phases 1–3

**Context.** The Phase 0 roadmap put project setup (1), authentication (2) and the academic structure (3) in separate phases. The college's Phase 1 brief asked for all three at once: "project setup, design system, database foundation, authentication foundation, role foundation, academic management foundation, initial seed data".

**Decision.** Deliver them together, because the academic management screens cannot be demonstrated or secured without authentication, and authentication has no visible value without a screen behind it. The original Phase 2 keeps its remaining work — the admin **User Accounts** UI (creating accounts, resetting passwords, granting individual permissions).

**Consequences.** Phase 1 is larger than planned but ends with something genuinely usable. Later phases are unchanged. The roadmap numbering in PROJECT_PLAN.md §18 is kept for continuity, with Phase 3 marked as merged.

---

## ADR-036 · Prisma 7 with the `pg` driver adapter, and the connection URL in `prisma.config.ts`

**Status:** Accepted · 2026-08-29

**Context.** Prisma 7 (the current stable release) removed the Rust query engine in favour of a query compiler plus a driver adapter, and no longer accepts `url = env("DATABASE_URL")` inside `schema.prisma`.

**Decision.** `@prisma/client` + `@prisma/adapter-pg` + `pg`. The CLI reads the URL from `prisma.config.ts` (which loads `.env` itself using Node's built-in `loadEnvFile`); the application passes it to `PrismaClient` through the adapter in `src/server/db/prisma.ts`. The pool size is an environment variable, `DATABASE_POOL_MAX` (default 10), because free hosted Postgres tiers allow very few connections; one-shot scripts use a single connection.

Prisma 8 exists only as a release candidate and was deliberately not used.

**Consequences.** A smaller install with no native engine binary to ship. The generated client lives in `src/generated/prisma` and is git-ignored — `npm run db:generate` recreates it.

---

## ADR-037 · The initial migration is generated with `migrate diff` and hand-extended

**Status:** Accepted · 2026-08-29

**Context.** `prisma migrate dev` needs a live database, which is not available while the developer is still setting theirs up. Several constraints the design depends on also cannot be expressed in Prisma's schema language.

**Decision.** The initial migration was produced with `prisma migrate diff --from-empty --to-schema`, then extended by hand with the SQL Prisma cannot generate:

- a case-insensitive unique index on `lower(username)`,
- a partial unique index enforcing exactly one current academic session,
- check constraints (session end after start, class level positive, code-sequence bounds),
- partial unique indexes for CNIC numbers and per-section roll numbers, which must allow many NULLs.

The developer applies it with `npm run db:migrate` (`prisma migrate deploy`).

**Consequences.** Setup needs no database at authoring time, and the rules that protect the data live in the database rather than only in application code. Future migrations use the normal `migrate dev` flow.

---

## ADR-038 · Verified against a real PostgreSQL engine before hand-off

**Status:** Accepted · 2026-08-29

**Context.** The development machine has no PostgreSQL and no Docker, and the college's database credentials do not exist yet. Shipping a foundation that had never actually run would have meant claiming untested work.

**Decision.** Phase 1 was verified end to end against an embedded PostgreSQL (PGlite) exposed over TCP: the real migration, the real seed scripts, `create-admin`, and the running application. The verification covered the login flow, CSRF and rate-limit behaviour, role isolation, creating a new program through the API and using it immediately, duplicate rejection, delete-versus-deactivate safety, multi-section groups, per-program curricula, session copying and audit logging. Results are recorded in PROJECT_PLAN.md §22.2.

This harness lived only in a temporary directory; it is not part of the project and the college's setup does not involve it.

**Consequences.** Every claim in the Phase 1 report is backed by an observed result. Two real defects were found and fixed this way: Prisma 7 reports unique-constraint violations under `meta.driverAdapterError.cause.constraint.index` rather than `meta.target` (so friendly duplicate messages were silently falling back to a generic one), and one-shot scripts needed a single-connection pool.

---

## ADR-039 · A small built-in JSON logger instead of pino, for now

**Status:** Accepted · 2026-08-29

**Context.** Structured server logs are needed, with guaranteed redaction of passwords, tokens and CNIC numbers. pino is excellent but needs `serverExternalPackages` configuration, and its transports add moving parts to the Next.js build.

**Decision.** A short logger writing one JSON object per line to stdout, with a redaction list. Hosting platforms collect stdout, which is all Phase 1 needs.

**Alternatives.** *pino* — kept as the upgrade path the moment we need file transports, log shipping or sampling; the `logger` interface is deliberately identical, so swapping it is a single-file change.

**Consequences.** Zero dependencies and zero bundler risk now; no work wasted later.

---

## ADR-040 · Hand-built components on Radix primitives, and native `<select>` on phones

**Status:** Accepted · 2026-08-29

**Context.** The project needs professional, accessible components. shadcn/ui is the usual answer, but its CLI writes files based on assumptions about the project layout, and its dependency set is larger than Phase 1 needs.

**Decision.** Write the components directly in `src/components/ui`, in the same spirit as shadcn/ui (we own the code, styled with Tailwind and `class-variance-authority`), using Radix primitives only where accessibility is genuinely hard to get right by hand: Dialog (focus trapping, Escape, labelling) and DropdownMenu. Dropdowns use the **native `<select>`** element, because on phones the operating system's own picker is faster and more accessible than any JavaScript replacement — and most of this system's users are on phones.

**Consequences.** A small, readable component set with no surprise dependencies. Individual shadcn/ui components can still be copied in later where they help.

---

## ADR-041 · No client-side data-fetching library in Phase 1

**Status:** Accepted · 2026-08-29 · revisits the Phase 0 stack table

**Context.** Phase 0 listed TanStack Query and react-hook-form. In practice the Phase 1 screens read their data in React Server Components and mutate through small forms.

**Decision.** Use Server Components for reads, and plain React state plus `fetch` for writes followed by `router.refresh()`. No TanStack Query and no react-hook-form yet.

**Alternatives.** Adding them now would mean two sources of truth for server data and more concepts for a beginner to hold, for no benefit at this size.

**Consequences.** Fewer dependencies and simpler code. They can be introduced in Phase 4 if the student list's filtering and pagination genuinely need client-side caching — a decision to make with real data in front of us.

---

## ADR-042 · Portal access is guarded in server layouts, not in middleware

**Status:** Accepted · 2026-08-29 · implements ADR-008

**Context.** Phase 0 planned a `proxy.ts` for coarse redirects. Next.js middleware has had bypass vulnerabilities (CVE-2025-29927), and it runs before the route is known.

**Decision.** No middleware at all. Each portal's `layout.tsx` calls `requirePortalAccess([...])` on the server, which loads the session, forces a pending password change, and redirects anyone who is in the wrong portal. Every service call independently checks permission and scope, so the layout guard is convenience rather than the security boundary.

**Consequences.** One fewer moving part, no middleware-bypass class of bug, and the guard sits next to the code it protects. Verified: a signed-in student receives a 307 to `/student` for both `/admin` and `/staff`, and 403 from the academics API.

---

## ADR-043 · Deleting is refused when a record is referenced; deactivation is the safe path

**Status:** Accepted · 2026-08-29 · implements requirement 15

**Context.** Deleting "Pre-Medical" after students have been enrolled under it would orphan their entire academic history.

**Decision.** Three layers, all real:

1. **Database** — foreign keys are `ON DELETE RESTRICT`, so the data cannot be orphaned even by a direct SQL mistake.
2. **Service** — `assertNotReferenced()` counts what depends on the record and throws a 409 naming it: *"cannot be deleted because it is already used by 4 academic group(s). Deactivate it instead — that hides it from new records while keeping all history intact."*
3. **UI** — the delete dialog explains the rule up front, and when the server refuses it offers a **Deactivate instead** button.

Deactivation (`is_active = false`) hides a record from new entries and never touches existing rows.

**Consequences.** Academic history cannot be destroyed by a mis-click. Verified against a live database: deleting an in-use program is refused, deactivating it succeeds, and all four of its groups remain readable afterwards.

---

# Phase 2 decisions (2026-08-29)

## ADR-044 · One new column, `users.full_name`, and the profile record stays authoritative

**Status:** Accepted · 2026-08-29

**Context.** Phase 1 derived a person's display name from their linked Student or Staff record, falling back to the username. An administrator has neither record, so there was nowhere to store their name — the portal showed "admin". Phase 2's create-account form asks for a full name for every role, including administrators.

**Decision.** Add a single nullable column, `users.full_name`. The display name is resolved in one fixed order everywhere:

```
student.full_name  →  staff.full_name  →  users.full_name  →  users.username
```

A linked profile therefore remains the single source of truth for staff and students; `users.full_name` only fills the gap for administrators (and for staff/student accounts created before their profile exists). Nothing is stored twice.

**Alternatives.** *Copying the name onto `users` for everyone* — two places to edit and guaranteed drift when Phase 4/5 rename someone. *Creating a Staff record for each administrator* — pollutes the staff list with people who do not teach, and would appear in staffing reports.

**Consequences.** One `ALTER TABLE ... ADD COLUMN` with no default, so it is safe on existing data — verified against the college's live Neon database with all Phase 1 records intact. Because the resolution order is repeated in three places (`session.ts`, `auth.service.ts`, `users.service.ts`), a comment in each points at the others; a missed one was in fact the first defect found during verification.

---

## ADR-045 · A temporary password is readable exactly once, in the response that creates it

**Status:** Accepted · 2026-08-29

**Context.** An administrator creating an account has to be able to give the person a password. The requirement is equally firm that plaintext passwords are never stored, logged or audited.

**Decision.** `createUser` and `resetUserPassword` generate a password, hash it with Argon2id, store only the hash, and return the plaintext in that single HTTP response. It appears nowhere else:

- not in the database (only the Argon2id hash),
- not in the audit entry (a reset records `{ sessionsRevoked, mustChangePassword }` and nothing more),
- not in the server logs (the logger redacts password-shaped fields anyway),
- not in any later `GET` — re-reading the account returns no password material at all.

The UI states plainly that it cannot be shown again and that the remedy for a lost password is another reset.

**Verification.** Every audit row was scanned for the generated-password pattern, Argon2 hashes, `password`/`passwordHash` fields and 64-character hex session-token hashes. None present.

**Consequences.** A lost temporary password costs one click to reissue, which is the right trade against ever storing recoverable passwords.

---

## ADR-046 · Accounts are deactivated, never deleted — there is no DELETE endpoint

**Status:** Accepted · 2026-08-29 · extends ADR-043 to user accounts

**Context.** Attendance, marks, results and every audit entry reference the user who recorded them. Deleting an account would orphan or erase that history. The requirement is explicit: someone leaving the college must not cause deletion.

**Decision.** `/api/v1/users/{id}` implements `GET` and `PUT` only. There is no `DELETE` handler anywhere, so the method returns 405 rather than relying on a permission check to refuse it. `accountsAreNeverDeleted()` exists in the safety module to give the rule one documented home if a future screen is tempted to offer it.

Deactivation is the intended path: `status = INACTIVE`, every session deleted in the same transaction, sign-in refused with a clear message, and all records untouched. Reactivating also clears any lockout so the person is not blocked twice.

**Consequences.** History is permanently safe. Should the college ever need a genuine erasure (a data-protection request, say), it will be a deliberate, audited, separately-designed operation — not a button next to "deactivate".

---

## ADR-047 · Lock-out safety rules are pure functions, separate from the service

**Status:** Accepted · 2026-08-29

**Context.** The rules that stop an administrator locking the college out of its own system are the most dangerous logic in the module, and the easiest to get subtly wrong: last active administrator, self-modification, and the protected owner account.

**Decision.** They live in `src/server/services/user-safety.ts` as pure functions taking a small `SafetyContext` (`actorUserId`, `activeAdminCount`) and a `UserSafetySubject`. They touch no database and no request, so each rule is unit-testable in isolation; the service simply gathers the facts and calls them.

Rules implemented:

| Action | Blocked when |
|---|---|
| Deactivate | it is yourself · the system owner · the only active administrator |
| Change role | it is yourself · the system owner · it would remove the only active administrator |
| Revoke `users.view` / `users.manage` / `permissions.manage` | from yourself · from the system owner · from the only active administrator |

The same reasons are surfaced in the UI as disabled buttons with an explanation, so an administrator learns why before clicking rather than after.

**Consequences.** 20 unit tests cover these rules directly, including the boundary where a second administrator makes an action legal again. The service stays readable, and the rules can be extended without touching data access.

---

## ADR-048 · A role change clears the person's permission overrides and revokes their sessions

**Status:** Accepted · 2026-08-29

**Context.** Individual overrides are chosen against a specific role. If a teacher with "may correct submitted attendance" granted to them is later made a student, keeping that exception would grant a student something no student should have.

**Decision.** Changing a role, in one transaction: updates the role, deletes every `user_permissions` row for that user, deletes every session, and writes an audit entry recording the old role, the new role and the exact overrides that were cleared. The person signs in again and their permissions are rebuilt from the new role.

**Alternatives.** *Keeping the overrides* — silently dangerous, for the reason above. *Migrating them* — there is no correct mapping between roles; guessing would be worse than clearing.

**Consequences.** Role changes are safe by construction, and the audit entry means a cleared exception can always be reinstated deliberately. The UI warns about both effects and requires the username to be typed before proceeding.

---

## ADR-049 · Overrides store only real exceptions

**Status:** Accepted · 2026-08-29

**Context.** The editor sends the complete desired state. A "GRANT" on something the role already allows, or a "REVOKE" on something the role never granted, changes nothing — but stored, it would look like a deliberate exception and would silently become wrong if the role's defaults later changed.

**Decision.** Before writing, the service drops any override that matches the role default. A stored `user_permissions` row therefore always means "this person deliberately differs from their role". The UI applies the same rule as you click, so the exception counter stays honest.

**Consequences.** The override list stays small and meaningful, and the permission editor's "N exceptions" badge is trustworthy. Verified: sending a redundant GRANT stores zero overrides.

---

## ADR-050 · Date formatting lives in a plain module, not in a `'use client'` file

**Status:** Accepted · 2026-08-29

**Context.** `formatDateTime` was first written alongside the badge components in a `'use client'` module. The server-rendered account page imported and called it, and Next.js failed the request at runtime: a server component may *render* a client component, but may not *call* a function exported from a client module. Neither `tsc --noEmit` nor `next build` reports this — only requesting the page does.

**Decision.** Pure helpers usable by both sides live in `src/lib/` with no `'use client'` marker (`src/lib/format.ts`, joining `cn.ts` and `password-policy.ts`). `'use client'` files export components, and re-export shared helpers for convenience.

**Consequences.** A general rule for the rest of the project, and a reminder that a green build is not the same as a working page. This is exactly the class of defect the run-the-app verification step exists to catch (ADR-038).

---

# Phase 3 decisions (2026-08-29)

## ADR-051 · Unbuilt modules are listed, never shown as zero

**Status:** Accepted · 2026-08-29

**Context.** A dashboard is judged by whether its numbers can be trusted. Attendance, exams, results, documents and notices do not exist yet, and their tables are not even in the database. The tempting shortcut is a card reading "Attendance today: 0".

**Decision.** Those modules contribute **no figures at all**. They appear once, in a "Not built yet" list with the phase number that will deliver them. A count is only ever shown for something the database can actually answer.

The reasoning is that "0" is not empty — it is a claim. "Attendance today: 0" states that nobody was marked present, which an administrator could act on. "Pass rate: 0%" is worse. The absence of a card says exactly what is true: this is not built yet.

The same rule shapes the empty states that *are* real: students and staff genuinely are zero, so the tiles show 0 with the explanation "None added yet — Phase 4", and no button offers to add one, because that screen does not exist.

**Consequences.** The dashboard looks less full today than a mocked-up one would, and becomes more informative with each phase. Every number on it can be traced to a query.

---

## ADR-052 · One dashboard service, batched queries, no page-level database access

**Status:** Accepted · 2026-08-29

**Context.** The Phase 1 dashboard ran nine separate `count()` queries directly inside the page component. Against a hosted database each of those is a network round trip, and the pattern invites a tenth query being added to a component somewhere.

**Decision.** All dashboard data comes from `getAdminDashboard(ctx)` in `dashboard.service.ts`. The page contains no queries, and `GET /api/v1/dashboard` serves the same object.

Efficiency measures inside the service:
- every user figure from one `GROUP BY role, status` instead of six counts,
- the eleven remaining counts sent as a single batched `prisma.$transaction([...])`,
- the structure tree reuses `listAcademicGroups` rather than re-querying the same thing differently,
- the audit query selects only the five columns a summary line needs and takes 12 rows,
- nothing loads a whole table — every figure is a `COUNT` or aggregate.

Shaping logic (summing counts, nesting the tree, describing an audit row) lives in `dashboard-helpers.ts` as pure functions, so it is unit-testable without a database.

**Consequences.** About five round trips instead of fifteen; measured at 0.11 s against a live database. Adding a statistic later means editing one service, and the API and page stay in step automatically.

---

## ADR-053 · Server rendering on every visit, with a manual refresh — no polling

**Status:** Accepted · 2026-08-29

**Context.** The dashboard must reflect the current state of the database. The options were caching with revalidation, background polling, or rendering fresh each time.

**Decision.** `export const dynamic = 'force-dynamic'`, so the page is rendered on the server on every visit and is never stale on load. A **Refresh** button (using `useTransition` + `router.refresh()`) covers the administrator who leaves the tab open, and the header shows when the figures were generated.

**Alternatives.** *Background polling* — would query the database every few seconds per open tab, for a page whose numbers change a few times a day; on a free-tier database that is real cost for no benefit. *Cached with revalidation* — an administrator who has just created a program expects to see it immediately, and a stale dashboard undermines trust more than a 100 ms render costs.

**Consequences.** Always-current figures, no cache invalidation to get wrong, and database load proportional to actual use.

---

## ADR-054 · The admin dashboard requires the ADMIN role, not merely `dashboard.view`

**Status:** Accepted · 2026-08-29

**Context.** `dashboard.view` is held by all three roles — every portal has a dashboard. If the admin dashboard endpoint checked only that permission, a staff member or student could call `/api/v1/dashboard` and receive college-wide statistics.

**Decision.** `getAdminDashboard` checks `dashboard.view` and then explicitly requires `ctx.role === 'ADMIN'`, throwing `ForbiddenError` otherwise. Within the dashboard, each section is gated by its own existing permission: user figures need `users.view`, the academic structure needs `academics.view`, recent activity needs `audit.view`. A section the administrator may not see is simply absent — never an error page.

**Consequences.** Verified: staff and students receive 403 from the API and are redirected away from `/admin`. An administrator with `audit.view` revoked gets a dashboard with an explanatory card in place of the activity list, and the page still works. Staff and student dashboards remain free to use `dashboard.view` for their own portals.

---

## ADR-055 · Recent activity is assembled from a fixed phrase table, never from stored snapshots

**Status:** Accepted · 2026-08-29

**Context.** Audit rows carry `beforeData`, `afterData` and `metadata` — JSON snapshots that can contain personal details, and in a future module might contain something more sensitive still. Rendering them on a dashboard would be an easy way to leak data by accident.

**Decision.** An activity line is built from three things only: the actor's name, a fixed phrase looked up from an action table (`'program.created'` → "created the program"), and the record's label. The snapshot columns are **not selected from the database at all**, so they cannot reach the page even by mistake. An unrecognised future action degrades to a readable version of its own name rather than dumping the row.

Sign-in and sign-out events are filtered out: they would drown the administrative changes that a dashboard exists to surface. The full audit viewer, with filters and the before/after detail, arrives in Phase 14.

**Consequences.** Verified by scanning both the API payload and the rendered HTML for passwords, Argon2 hashes, session-token hashes, snapshots, IP addresses, user agents, emails and CNIC patterns — none present. A unit test feeds a deliberately hostile audit row containing a fake password and hash, and asserts the output object has exactly seven safe keys.

---

# Phase 4 decisions (2026-08-30)

## ADR-056 · One ACTIVE enrollment per session, unlimited closed rows — so a transfer keeps history

**Status:** Accepted · 2026-08-30 · refines ADR-032

**Context.** The original design allowed exactly one `student_enrollments` row per student per academic session. That was right for promotion (a new session means a new row) but wrong for a mid-year move: changing a student from Pre-Medical to ICS Physics in November could only be done by overwriting the row, erasing the record of where they had been for three months. The requirement is explicit that a transfer must not destroy history.

**Decision.** Replace the constraint with a partial one: **one ACTIVE enrollment per student per session**, with any number of closed rows beside it. `TRANSFERRED` joins the status list. A move is now:

```
close the current row  (status TRANSFERRED / PROMOTED / REPEATED / COMPLETED / LEFT, end date set)
open a new ACTIVE row
```

Roll numbers follow the same idea: unique on `(section_id, roll_number)` among **active** enrollments only, so a roll number becomes free again the moment a student leaves that section rather than staying reserved forever.

**Alternatives.** *Keep the single row and rely on the audit log* — the audit entry does record the change, but as JSON meant for investigation, not as queryable academic history; the profile could not list a student's placements. *A separate `enrollment_history` table* — duplicates the same columns and creates two places to keep in step.

**Consequences.** A student's profile shows every placement they have ever had, across transfers and years. Verified: a student moved Pre-Medical → Pre-Engineering and then promoted into 2027-28 has three rows, all readable. Queries for "current placement" filter on `status = 'ACTIVE'`, which the partial index makes exact.

---

## ADR-057 · Roll numbers are unique per section, which is exactly the five-part scope

**Status:** Accepted · 2026-08-30

**Context.** The requirement asks that a roll number be unique within session + class + division + program + section, and explicitly *not* globally unique across the college.

**Decision.** The constraint is on `(section_id, roll_number)` among active enrollments.

This is not a simplification — it is the same rule. A section belongs to exactly one academic group, and a group **is** session × class × division × program (ADR-031). So "unique within this section" and "unique within this session+class+division+program+section" describe an identical set of rows. Expressing it with one column instead of five means the two halves can never drift apart, and the database enforces it directly.

**Consequences.** Roll 101 can exist once in 1st Year · Boys · Pre-Medical · A, again in Section B, and again in the Girls division — all correct. Verified against a real database, including the case where a departed student's roll number is reissued.

---

## ADR-058 · Student Management requires the ADMIN role, not only `students.view`

**Status:** Accepted · 2026-08-30 · applies the ADR-054 pattern

**Context.** `students.view` is a STAFF default, because Phase 0 planned for teachers to see the students in the sections they teach — as a **limited view**: their own sections only, and without CNIC, address or guardian details. That scoping depends on teacher assignments, which arrive in Phase 5.

Running the application revealed the consequence: with only the permission check in place, a signed-in staff member calling `GET /api/v1/students` received the full administrative list of every student, including guardian and identity fields.

**Decision.** Every function in `students.service.ts` calls `assertAdminArea(ctx)` after its permission check, requiring `ctx.role === 'ADMIN'`. All ten exported functions carry it, including the enrollment-options endpoint that feeds the form dropdowns. The scoped teacher view will be a separate service returning a reduced DTO, added with teacher assignments.

**Consequences.** Verified: staff and students receive 403 from every student endpoint and are redirected away from `/admin/students`. Holding `students.view` can no longer expose the whole college. This is the same shape as the admin dashboard guard (ADR-054), and the reason is recorded in the code so Phase 5 does not simply delete it.

---

## ADR-059 · Identifiers come from a database counter, allocated atomically

**Status:** Accepted · 2026-08-30

**Context.** Students need an identifier that a person can read out over the phone and write on a form — `STU-0001`, not a UUID. Two administrators admitting students at the same moment must never receive the same one, and the browser must never choose it.

**Decision.** `nextCode()` performs a single statement:

```sql
UPDATE code_sequences SET next_value = next_value + 1
 WHERE key = $1 RETURNING prefix, next_value - 1 AS value, padding
```

One atomic statement means the database hands out different numbers to concurrent callers with no lock to manage. It runs inside the same transaction as the student row, so a number is only consumed if the student is actually created. Prefix and padding are table columns, so the college can change the format without a code change. The admission number works the same way but may also be supplied by hand.

The pure formatting half lives in `src/lib/codes.ts` so tests and the browser can use it without pulling in the database client — the same split as the password policy (ADR-050).

**Consequences.** No duplicate identifiers, no gap-filling logic, and the add-student form can preview the next ID before saving.

---

## ADR-060 · The enrollment form sends all five ids; the server verifies them against each other

**Status:** Accepted · 2026-08-30

**Context.** Only `sectionId` needs to be stored — the section already knows its class, division, program and session. But the form collects all five as the administrator narrows the dropdowns, and a stale page or a tampered request could send a section that does not belong to the combination shown on screen.

**Decision.** The browser sends all five ids. `resolveSection()` loads the section with its group and rejects the request unless the class, division, program and session all match what was selected, with a message telling the administrator to choose again. It also refuses a deactivated section or group. Only `sectionId` is then written.

**Consequences.** A student can never be placed somewhere the administrator did not actually choose. Verified: sending a Pre-Medical class/division/program with a Pre-Engineering section is rejected. The cascading dropdowns are a convenience; the server is the check.

---

## ADR-061 · Subjects come from the curriculum, never stored on the student

**Status:** Accepted · 2026-08-30 · applies ADR-033

**Context.** A student profile should show which subjects they study. The tempting shortcut is a list of subjects on the student record.

**Decision.** The profile derives them: the student's active enrollment gives a section, the section gives class and program, and `curriculum_subjects` gives that class × program's subject list for the session. Nothing subject-related is stored on the student.

When the curriculum has not been set up the profile says so plainly and links to the Curriculum screen — it does not invent subjects.

**Consequences.** Changing "Pre-Medical studies Biology" updates every Pre-Medical student at once. A student who transfers to another program immediately shows the new program's subjects, with no per-student data to migrate.

---

# Phase 5 decisions (2026-08-31)

## ADR-062 · The scoped teacher view: one scope function, one reduced shape

**Status:** Accepted · 2026-08-31 · completes the design ADR-058 deferred

**Context.** `students.view` is a STAFF default because Phase 0 always intended teachers to see the students they teach. Phase 4 could not honour that safely — without teacher assignments there was no way to say *which* students — so Student Management was locked to administrators. Phase 5 has the assignments, so the intended design can be built.

**Decision.** Teachers reach student data only through `staff-portal.service.ts`, never through the admin service, and two rules are enforced there:

**Scope.** A single function, `getScopedSectionIds(staffId, session?)`, returns the sections a teacher may see: those with an ACTIVE teaching assignment, plus those where they are the ACTIVE in-charge. Everything in the portal is built on it, so there is exactly one place to read, test and reason about. Being staff grants nothing on its own; a staff login with no linked staff record sees nothing at all, rather than everything. Requesting a section outside that set returns **403**, not an empty list, so an attempt appears in the logs.

**Shape.** The `ScopedStudent` type carries eleven fields — enough to take a register. CNIC, father's CNIC, address, phone, guardian details, date of birth, admission number and notes are **not selected from the database** by the query at all. Adding one would be a deliberate edit to a `select` block, not an oversight.

**Alternatives.** *Filtering the admin DTO* — one forgotten field leaks everything, and the filter lives far from the query. *A permission such as `students.view_limited`* — permissions answer "may they do X"; *which rows* is scope, and mixing the two would duplicate the model (ADR-007).

**Consequences.** Verified with three students in three sections and one teacher assigned to one of them: they saw 1 of 3, were refused the other two sections by id, were refused both admin APIs, and their payload contained no sensitive field. Resigning the teacher emptied their scope in the same request.

---

## ADR-063 · Section in-charge is a record with history, not a column

**Status:** Accepted · 2026-08-31 · same reasoning as ADR-056

**Context.** Phase 1 put `incharge_staff_id` on `sections`. Replacing the class teacher in March would silently erase the fact that somebody else held the role until then — which matters once attendance and results refer back to who was responsible.

**Decision.** A `section_incharges` table: section, staff, session, `is_active`, `assigned_at`, `ended_at`. A partial unique index on `(section_id) WHERE is_active` lets the database enforce "at most one active in-charge per section". Appointing a replacement closes the current row and opens a new one. The column on `sections` is dropped, and any value it held is migrated across.

**Alternatives.** *Keeping the column as a cached "current" pointer* — two places to keep in step, and they will drift. *Adding a role flag to `teacher_assignments`* — would make `subject_id` nullable and complicate the assignment uniqueness rules for no gain.

**Consequences.** A teacher's profile lists past in-charge roles as well as current ones, and the scope function reads one table for both kinds of access. Verified: a second active in-charge is rejected; after a replacement both rows remain.

---

## ADR-064 · Assignment uniqueness applies to active rows only

**Status:** Accepted · 2026-08-31

**Context.** `unique(staff_id, section_id, subject_id)` was permanent. Once a teacher's assignment was closed, that exact combination could never exist again — so a teacher could not resume a subject they had taught the year before, and closing an assignment quietly became irreversible.

**Decision.** A partial unique index on active rows. Closed rows are history and impose no constraint. This is the same pattern as student enrollments (ADR-056) and roll numbers (ADR-057): *uniqueness applies to what is true now, not to what was ever true.*

**Consequences.** Verified: a duplicate active assignment is rejected; after closing one, the identical assignment can be created again, and both rows remain on record.

---

## ADR-065 · Designations and departments are reference tables

**Status:** Accepted · 2026-08-31

**Context.** `staff.designation` was free text, so "Lecturer", "lecturer" and "Lectrer" could all coexist and the list could never be filtered reliably. Departments were already a table but had no screen, so nothing could be added to them.

**Decision.** A `designations` table alongside `departments`, both managed from Academic Management using the **same `ResourceManager` screen** as Classes, Divisions and Programs — so two new managed lists cost almost no new code and behave identically, including the delete-versus-deactivate rule (ADR-043). `staff.designation_id` is a required foreign key; existing free-text values are copied into the table by the migration so no record loses its title.

**Alternatives.** *Keeping free text* — no code change ever needed, but no consistency either; the requirement asked for configurable reference data, and departments already set that precedent. *An enum* — would need a migration for every new job title, which is exactly what the college must not have to ask for.

**Consequences.** Adding "Senior Lecturer" is data entry and is selectable immediately. A designation held by any staff member cannot be deleted, only deactivated.

---

## ADR-066 · Staff types describe function; designation describes the job title

**Status:** Accepted · 2026-08-31

**Context.** `TEACHING` / `NON_TEACHING` lumped the principal in with the caretaker, and the requirement asked for Teacher, Administrator and Support Staff.

**Decision.** `staff_type` becomes `TEACHING`, `ADMINISTRATIVE`, `SUPPORT` — a small closed set the application genuinely branches on: **only TEACHING staff can be given subject assignments**. The specific job title lives in the `designations` table, where it is open-ended.

`NON_TEACHING` remains defined but is never offered: PostgreSQL cannot drop an enum value, and rewriting the rows would need a second migration for a value only demo data uses. It is labelled "Non-teaching" wherever an old row still shows it.

**Consequences.** The distinction that matters is enforced — verified: an administrative staff member is refused a subject assignment with a message naming their type — while job titles stay unlimited.

---

## ADR-067 · A subject can only be assigned if it is in that program's curriculum

**Status:** Accepted · 2026-08-31

**Context.** Nothing structurally prevented assigning a teacher "Biology" in an ICS Physics section. That assignment would then appear on timetables, attendance sheets and mark sheets that make no sense, and would be discovered only much later.

**Decision.** `createAssignment` checks `curriculum_subjects` for the section's `(session, class, program)` and refuses anything absent, naming what is missing: *"Mathematics is not part of the 1st Year · Pre-Medical curriculum for 2026-27. Add it to the curriculum first."* The assignment form only offers subjects from that curriculum, so the check is a backstop rather than the first line of defence.

**Consequences.** The curriculum (ADR-033) becomes the single definition of what is taught where, and teaching assignments cannot contradict it. It also means the curriculum must be set before teachers are assigned — which the message says plainly.

---

## ADR-068 · Ending employment closes assignments, which ends access

**Status:** Accepted · 2026-08-31

**Context.** A teacher who resigns must stop seeing student data immediately. Relying on someone remembering to deactivate their login separately would leave a gap.

**Decision.** Setting any status other than Active or On leave closes every active teaching assignment and in-charge role in the same transaction, with an audit entry recording how many. Because scope is computed from those rows, access ends in the same request — no separate step, and no dependence on the login being deactivated too.

Reinstating someone does **not** silently reopen the closed assignments: the college decides what they teach on their return, deliberately.

**Consequences.** Verified: a resigned teacher's student list went from 1 to 0 immediately, they were refused new assignments while resigned, and reactivating them left the closed assignments closed. Every row is kept, so past attendance and results stay attributable.

---

# Phase 6 decisions (2026-08-30)

## ADR-069 · The refresh token is encrypted, because it cannot be hashed

**Status:** Accepted · 2026-08-30 · implements the storage half of ADR-010

**Context.** Passwords are hashed: we only ever *compare* them, so the original can be thrown away. A Google refresh token is different — it has to be sent back to Google every time an access token is needed, so it must be recoverable. `APP_ENCRYPTION_KEY` had been validated in `env.ts` since Phase 1 and used by nothing.

**Decision.** `crypto/secret-box.ts` encrypts with **AES-256-GCM**, storing `v1.<base64 of iv ‖ tag ‖ ciphertext>` in the `settings` table. GCM is authenticated, so a value that has been altered fails loudly instead of decrypting to plausible rubbish. The purpose string (`google.refresh_token`) is mixed in as additional authenticated data, so a ciphertext cannot be moved to another setting and still decrypt. A random IV per encryption means two identical tokens do not produce identical ciphertexts.

Secret keys are listed in `SECRET_SETTING_KEYS`, and every reader that returns settings to a browser goes through `listPublicSettings`, which excludes them **by construction** rather than by remembering to filter.

**Alternatives.** *Plaintext in the database* — the token is a live key to the college's Drive; a database backup should not be one too. *A file on disk* — no better, and harder to rotate. *AES-CBC* — unauthenticated, so tampering would be silent.

**Consequences.** Rotating `APP_ENCRYPTION_KEY` makes the stored token unreadable, which means "reconnect from Settings" — an acceptable, clearly-messaged cost. Verified by 11 tests: round-trip, non-repeating ciphertext, altered ciphertext refused, wrong key refused, wrong purpose refused, and the plaintext never appearing in an error message.

---

## ADR-070 · OAuth state is bound to the administrator, in an HttpOnly cookie

**Status:** Accepted · 2026-08-30

**Context.** The OAuth callback is a **GET**, and `assertSameOrigin` only guards POST/PUT/PATCH/DELETE. Without protection, an attacker could send an administrator a crafted callback URL and attach *their own* Google account to the college's system — every document uploaded afterwards would land in the attacker's Drive.

**Decision.** `beginConnection` generates 32 random bytes and stores `<state>.<userId>` in an HttpOnly, SameSite=Lax cookie scoped to `/api/v1/settings/google`, valid ten minutes. The callback requires all three: an authenticated administrator, a `state` matching the cookie (compared in constant time), and the same user id that started the flow. The cookie is deleted whether the check passes or fails, so a state is single-use.

SameSite=Lax is correct here rather than Strict: Lax still sends the cookie on Google's top-level redirect back to us, which Strict would block.

**Alternatives.** *State in the database* — a table and a cleanup job for something that lives ten minutes. *State alone, unbound to a user* — would stop a forged callback but not one administrator finishing another's flow.

**Consequences.** Verified live: a callback carrying a state the server never issued is refused and returns the administrator to Settings with a plain-English explanation, not a stack trace.

---

## ADR-071 · Sensitivity is a property of the document type, not of the reader

**Status:** Accepted · 2026-08-30 · the security core of Phase 6

**Context.** Phase 5 established that a teacher may see the students they teach (ADR-062). Documents make the limits of that concrete: a class teacher genuinely needs a student's **photograph** for their register, and just as genuinely does not need the family's **CNIC and B-Form**. Treating "can see the student" as "can see everything about the student" would leak identity documents to every teacher in the college.

**Decision.** `document_types.is_sensitive` marks identity documents. Access then follows four rules, in order:

1. **Your own documents are yours** — a student may open their own B-Form; a staff member their own CV. Sensitivity does not apply to the person it belongs to.
2. **An administrator** needs `documents.view`, and `documents.view_sensitive` as well for a sensitive document.
3. **A teacher** needs the student to be in their Phase 5 scope **and** the document to be non-sensitive — unless `documents.view_sensitive` has been granted to them individually.
4. **Everything else is refused**, including one staff member reading another's file.

The decision lives in `documents/access.ts` as a **pure function** with no database access, so the rule is unit-testable rather than merely asserted in a comment. The service does the one lookup the function cannot do for itself (is this student in the teacher's sections?) and reuses `getScopedSectionIds` — the same function Phase 5 uses — so "which students can a teacher see" has exactly one answer in the codebase.

**Alternatives.** *A permission per document type* — the permission list would grow with every new type the Admin adds, which defeats the point of types being data. *Hiding sensitive rows entirely from teachers* — the checklist would then lie about what the office holds; showing "on file — restricted" is honest and still discloses nothing.

**Consequences.** A college that wants one clerk handling documents grants them `documents.view_sensitive` in User Accounts — no code change. Verified by 15 unit tests covering both sides of every rule, and live: a teacher saw the photograph row as viewable and all four identity rows as restricted for a student they teach, and got 403 for a student they do not.

---

## ADR-072 · Uploading is administrator work; the role gates it as well as the permission

**Status:** Accepted · 2026-08-30 · same reasoning as ADR-058

**Context.** `documents.view` is a default for staff and students so they can see their own records. Upload, replace and delete are a different matter: a student must not be able to replace their own CNIC scan with a different one, and a teacher must not alter a student's file.

**Decision.** `assertCanManageDocuments` requires the **ADMIN role** in addition to `documents.upload` / `.replace` / `.delete`. The permission says *what*; the role decides *whose records*. Uploading over an existing document of the same type is treated as a replace and requires `documents.replace`, so the two can be granted separately.

**Consequences.** Verified live: a student and a teacher both received 403 when posting a valid JPEG to a student's document endpoint. If the college later wants students to submit their own documents, that is a deliberate new feature with its own review — not an accident of permissions.

---

## ADR-073 · The file's bytes decide its type, never the browser

**Status:** Accepted · 2026-08-30

**Context.** The `Content-Type` on an upload is chosen by whatever sent the request. Renaming `payload.html` to `photo.jpg` changes it. Storing that file and later serving it back would be a stored-XSS hole, and `UPLOAD_ALLOWED_MIME` alone would not stop it.

**Decision.** `documents/file-validation.ts` reads the leading bytes and identifies the file itself — JPEG (`FF D8 FF`), PNG, WebP (`RIFF`…`WEBP`) and PDF. The declared type is used only to write a clearer error message. Order matters: size is checked **before** type, so a huge file is rejected without inspection. Limits come from the document type, so a photograph is capped at 2 MB while a scan may be 10 MB; `UPLOAD_MAX_SIZE_MB` is only a hard ceiling applied before the body is read into memory.

The stored filename is generated (`STU-0001_STUDENT_PHOTO_20260901-143022.jpg`), never taken from the upload. The original name is kept for display only. Files are served with `X-Content-Type-Options: nosniff`, a restrictive `Content-Security-Policy`, and `Cache-Control: private, no-store`.

**Alternatives.** *Trusting the MIME type* — one line of code and a real vulnerability. *A library such as `file-type`* — another dependency for four signatures; the check is short enough to read and test directly.

**Consequences.** Verified: an HTML file named `photo.jpg` is refused before Drive is touched, a PDF is refused where only images are allowed, a 3 MB photograph is refused against the 2 MB per-type limit, and a RIFF file that is not WebP is not mistaken for one.

---

## ADR-074 · Drive ids stay on the server; files stream through the app

**Status:** Accepted · 2026-08-30 · implements ADR-012

**Context.** The easy way to show a document is to hand the browser a Google Drive link. Any such link is either public, or useless to someone who is not signed in to that Google account — and a public link to a student's B-Form is exactly what must never exist.

**Decision.** The browser only ever sees the document's own uuid. `GET /api/v1/documents/[id]/content` re-runs the full access check on **every request** and streams the bytes through the server. `permissions.create` is never called, so nothing in Drive is ever shared. The `drive.file` scope means the app can only see files it created — it cannot read the rest of the connected account.

**Consequences.** Every view costs a Drive round trip, which is the right trade for records like these. A URL copied out of the address bar does nothing for anybody else, and revoking someone's access takes effect on their next click. Verified: no Drive id or folder id appears anywhere in the API responses, and an unauthenticated request for document content is 401.

---

## ADR-075 · Replacing keeps history; the database is written after Drive, and cleaned up if it fails

**Status:** Accepted · 2026-08-30 · implements ADR-014

**Context.** Two related problems. First, a replaced document must not vanish — "which CNIC did we hold in August?" is a real question. Second, the file and its database row live in different systems, so one can succeed while the other fails.

**Decision.** Partial unique indexes allow at most one **current** document (`ACTIVE` or `NEEDS_REPLACEMENT`) per person per type; `REPLACED` and `DELETED` rows are history and unlimited — the same rule as enrollments (ADR-056) and roll numbers (ADR-057): *uniqueness applies to what is true now, not to what was ever true.*

Because of that index the order inside the transaction is forced: close the old row, insert the new one, then point the old row at its replacement. Doing it the other way round would collide with the row being replaced.

Across the two systems the order is: upload to Drive, then write the database. The reverse is impossible — the row cannot be written before Drive has issued a file id. If the transaction fails, the just-uploaded file is moved to Drive's trash, so a failed upload leaves nothing orphaned. The old file is trashed only **after** the new row is safely committed, and a failure there is logged as untidiness rather than raised: the record is already correct.

Deleting marks the row `DELETED` and trashes the file — recoverable for 30 days. A `CHECK` constraint guarantees exactly one owner column is set, so "whose document is this?" always has one answer.

**Consequences.** Verified with 13 database-level checks: a second active photo is refused, a second *replaced* photo is accepted, the same photo type can be uploaded again once the old one is replaced, a document owned by both a student and a staff member is refused, one owned by nobody is refused, and deleting a student removes their document rows.

The `UPLOADING` status defined in the schema is not used by this pipeline, since a row cannot exist before its file id does. It is kept for a future resumable-upload path rather than removed, and nothing pretends to use it.

---

## ADR-076 · Not connected is a configuration problem (503), not a Drive failure (502)

**Status:** Accepted · 2026-08-30

**Context.** The first live run returned `502 Bad Gateway` for an upload attempted before Drive had been connected. Technically a storage error; practically misleading — 502 says "the other system is broken", when in fact nobody had set it up yet.

**Decision.** Every "no connection yet" path raises `DriveNotConnectedError` (503, `NOT_CONFIGURED`) with a message naming the fix: *"An administrator can connect it in Settings."* `translateDriveError` maps the rest by cause: `invalid_grant` becomes a 503 telling the administrator to reconnect (this is the seven-day Testing-mode expiry), quota exhaustion says the account is out of space, 429 and 5xx say to try again shortly.

**Consequences.** The error a user sees now names the action that fixes it. Verified live: an upload with Drive unconnected returns 503 with that message, rather than a crash or a misleading gateway error.

---

## ADR-077 · Only data crosses the server/client boundary

**Status:** Accepted · 2026-08-30 · fixes a defect from Phase 1, found during Phase 6 verification

**Context.** The six Academic Management screens returned **HTTP 500 in a production build**. Each was a server component that passed `columns[].render`, `labelOf` and `toFormValues` — ordinary JavaScript functions — as props into `ResourceManager`, which is `'use client'`.

Props crossing that boundary have to be serialisable so React can send them to the browser, and a function cannot be serialised. The one exception is a Server Action marked `'use server'`, which is sent as a reference rather than as code; these were not Server Actions but render callbacks, so no annotation could have made them legal.

`next dev` tolerates this; the production renderer does not. That is why five phases passed with the fault present: every earlier phase was verified with `next dev`, and Phase 6 was the first verified against `npm run build && npm run start`.

**Decision.** A server component passes **data** across the boundary and nothing else. Where a client component needs configuration expressed as functions, that configuration is *defined* on the client side of the line.

Each screen gained a thin `'use client'` wrapper — `classes-manager.tsx`, `divisions-manager.tsx` and so on — that owns its own columns, fields, `labelOf` and `toFormValues`, and accepts a single serialisable `items` prop. The page stays a server component and keeps doing what only a server can: `requirePortalAccess(['ADMIN'])` and the database read.

`ResourceManager` itself is unchanged. So are every API route, service, validation schema and audit call. Authorisation was never in these files and did not move.

**Alternatives.** *Making the columns declarative* (`{ header, field, kind }` interpreted inside `ResourceManager`) would remove functions entirely and keep one file per screen, but it trades a general, readable render callback for a small private template language, and would rewrite a component that works. *Making the whole page a client component* would move the data fetch into the browser and push the access check behind an API call instead of in front of the render — strictly worse for both security and first paint.

**Consequences.** Six new files of pure presentation config, and one rule that is easy to check: if a prop going into a `'use client'` component is a function, it is wrong.

Verified against a clean production build: all six screens return 200 with the correct row counts (2 classes, 2 divisions, 5 programs, 14 subjects, 12 designations, 10 departments); create, rename, deactivate and delete all work with their audit entries written; a signed-in staff user is redirected to their own portal and refused every write API with 403; and a signed-out visitor is sent to the login page.

The wider lesson has been folded into how phases are signed off: **verification runs against the production build**, not `next dev`. A whole class of defect is invisible under the dev server.

---

# Phase 7 decisions (2026-08-30) — attendance database

## ADR-078 · A sheet is a class meeting; an entry is one student at it

**Status:** Accepted · 2026-08-30 · refines the Phase 0 design in docs/DATABASE_SCHEMA.md §4

**Context.** Attendance could be stored as one flat table of (student, date, subject, status). That looks simpler until you ask who took the register, whether it was handed in, or whether the class happened at all — none of which are facts about a student.

**Decision.** Two tables. `attendance_sheets` is one class meeting: section, date, period, subject, who marked it, whether it is a draft, submitted or cancelled. `attendance_entries` is one student at that meeting: status and an optional remark.

**`subject_id` is nullable, and the NULL carries meaning:** NULL is the section in-charge's daily roll-call, a value is subject-wise attendance from that subject's teacher. This is the one deviation from Phase 0, which made the column required. The college needs both kinds, and one nullable column is far less machinery than a second pair of tables that would duplicate every index and every rule.

`period` is included from the start, defaulting to 1. Phase 0 reserved it "if ever enabled"; adding a column later is cheap, but changing a unique index on a table with a million rows is not.

**Consequences.** Facts live where they belong, and "which registers has this teacher not submitted?" is one indexed query rather than a group-by over student rows.

---

## ADR-079 · PRESENT, ABSENT, LATE, LEAVE — and what each does to the percentage

**Status:** Accepted · 2026-08-30

**Context.** A percentage rule that is not written down becomes whatever the first report query happened to do. It has to be decided once, in the open, because students are held to 75% by their board.

**Decision.** Four statuses. `LEAVE` rather than `EXCUSED`, because the setting `attendance.leave_counts_as_present` was seeded in Phase 1 with that name and it is the word Pakistani colleges use.

```
default:                    (PRESENT + LATE) ÷ (PRESENT + LATE + ABSENT + LEAVE)
leave_counts_as_present:    (PRESENT + LATE + LEAVE) ÷ (PRESENT + LATE + ABSENT + LEAVE)
```

**LATE counts as present.** The student was in the room. Storing it as its own status rather than folding it into PRESENT means a pattern of lateness stays visible, and a future "three lates make an absence" policy is a settings change, not a migration.

**LEAVE lowers the percentage by default**, and the existing setting flips that for the whole college without touching the schema.

Percentages are **always computed, never stored**. A stored percentage is wrong the moment a correction is made.

**Consequences.** The worked example — 20 sessions, 16 present, 2 late, 2 absent — is (16+2) ÷ 20 = 90%.

---

## ADR-080 · Duplicate registers are refused by the database, including daily ones

**Status:** Accepted · 2026-08-30

**Context.** A teacher opening the register twice is an ordinary accident. If the second one is accepted, every percentage built on it is quietly wrong, and nobody finds out.

**Decision.** `UNIQUE (section_id, subject_id, date, period) NULLS NOT DISTINCT` on sheets, and `UNIQUE (sheet_id, student_id)` on entries.

`NULLS NOT DISTINCT` is the whole point of the first one, and Prisma cannot express it. PostgreSQL's default is that every NULL differs from every other NULL — so with a plain unique index a section could have unlimited *daily* registers on one date, which is precisely the case the nullable `subject_id` introduced. The migration therefore writes that index by hand, using the name Prisma expects for the same columns, so `prisma migrate diff` reports no drift while the database behaves correctly. Verified: the diff comes back empty against the live database.

Requires PostgreSQL 15+. The project's Neon instance is 18.6 and the test harness is 17.5; both were checked before the migration was written.

**Consequences.** A test asserts the index definition still contains `NULLS NOT DISTINCT`, so a future migration that regenerated it the Prisma way would fail the suite rather than silently re-open the hole. A negative control confirmed the plain index does accept the duplicate.

---

## ADR-081 · Attendance is cancelled, never deleted — and why CASCADE is still correct

**Status:** Accepted · 2026-08-30 · same reasoning as ADR-056 and ADR-075

**Context.** A class that did not happen is not the same as a class with no record. Removing the row loses the fact that the day was accounted for.

**Decision.** A sheet moves to `CANCELLED` with a `cancelled_reason`; its entries stay. Corrections update an entry in place and are explained by an audit row. Nothing in the application will expose a delete.

`attendance_entries` still uses `ON DELETE CASCADE` from its sheet. That is deliberate, and it is not a contradiction:

- The cascade is a **referential** rule, not a workflow. An entry has no meaning without its meeting, so an orphan must be impossible at the database level.
- It is what makes the *only* legitimate deletion safe — removing a student's whole record, which already cascades their documents (ADR-075).
- The workflow guarantee is that no service function and no route will ever call `delete` on a sheet. Cancellation is the operation the application offers.

Keeping RESTRICT instead would leave orphaned entries as the failure mode, which is strictly worse than a cascade that nothing triggers.

**Consequences.** Verified: cancelling a sheet leaves its entries in place, and the database refuses to delete a student, a subject or a staff member that attendance refers to.

`subject_id` is `ON DELETE RESTRICT`, **not** Prisma's default `SET NULL` for an optional relation. This is important precisely because NULL means "daily roll-call": nulling the column would silently rewrite a term of Biology attendance as daily attendance. Prisma generated `SET NULL`; it was changed by hand and the schema records the intent.

---

## ADR-082 · One place decides what day it is

**Status:** Accepted · 2026-08-30

**Context.** `APP_TIMEZONE=Asia/Karachi` had been in `.env` since Phase 1 and nothing read it — and nothing needed to, because every date so far was typed in by a person. Attendance is the first feature where the *server* decides the date.

Pakistan is UTC+5. A server running in UTC — the default nearly anywhere this would be deployed — rolls into the next day at 5am Pakistan time. Attendance marked in an evening class would be filed on tomorrow. On a developer machine in Karachi the bug is completely invisible, which is how it would reach production.

**Decision.** `src/server/time/college-date.ts` is the only thing that answers "what day is it": `todayInCollegeTimezone()`, `toCollegeDate()`, `isValidCollegeDate()`, `collegeDateToStorage()`, `storageToCollegeDate()`, `isFutureCollegeDate()`. Dates are stored in a plain `date` column — no timezone is written on the row, because a calendar day does not have one — and are anchored at midnight **UTC** when converted, so serialisation can never shift the day.

**Alternatives.** *A timezone column per attendance row* — stores the same constant a million times and invites rows that disagree. *Doing the conversion at each call site* — the same subtle arithmetic repeated, wrong in one place eventually.

**Consequences.** Tested with fixed instants rather than "now", so the tests prove the answer comes from Karachi and not from the machine: 18:59:59 UTC is still the 1st, 19:00:00 UTC is already the 2nd, and the year rolls correctly at new year.

---

# Phase 7 decisions (2026-08-30) — attendance service and API

## ADR-083 · Marking rights are subject-level, not section-level

**Status:** Accepted · 2026-08-30 · extends ADR-062

**Context.** Phase 5 answers "which sections may this teacher see?" with one function, `getScopedSectionIds()`. Attendance asks a narrower question. A teacher who takes Biology in Section A can see that section — but must not be able to file a Chemistry register for it, and must not take the whole section's daily roll-call unless they are the class teacher.

**Decision.** One function, `assertCanMarkAttendance(ctx, sectionId, subjectId)`, and two different gates behind it:

| Kind | `subjectId` | Requires |
|---|---|---|
| Subject-wise | set | an ACTIVE `TeacherAssignment` for that staff **and** section **and** subject |
| Daily roll-call | null | an ACTIVE `SectionIncharge` for that section |

The decision itself lives in `attendance/access.ts` as a pure function, in the same shape as the document rules (ADR-071): the service resolves the facts, the function decides, and every rule has a test proving both what it allows and what it refuses.

`getScopedSectionIds()` is deliberately **not** used for marking. It answers a broader question, and reusing it here would silently grant every subject teacher the right to mark every subject in their sections. It is still the right tool for *reading*, which is why the sheet list and sheet detail use section-level scope.

**Consequences.** Verified against a running production build: a teacher assigned Biology got 201 for Biology and **403** for Chemistry in the same section; a subject teacher who was not the in-charge got **403** for daily roll-call.

---

## ADR-084 · The roster is rebuilt on the server, every time

**Status:** Accepted · 2026-08-30

**Context.** The obvious API takes a list of students and their statuses. That list is the attack: add an id and a student from another section acquires attendance; remove one and a student quietly disappears from the day.

**Decision.** `createAttendanceSheet` ignores any roster the client offers and builds its own from `student_enrollments` where the section, session and ACTIVE status match. Statuses may be supplied, but only for students already on that roster — an unknown id is **refused**, not skipped, so a mistake is visible instead of silent.

The academic session is likewise derived from the section rather than accepted from the request. A section belongs to exactly one session, so there is nothing for the browser to tell us and nothing to disagree about.

Submitting re-checks the roster: if a student has joined the section since the register was opened, submission is refused and names them, rather than recording a day in which they did not exist.

**Consequences.** Verified: an unenrolled student id in the create call and in the bulk-mark call were both refused with 400. A section with no active students is refused with *"No active students are enrolled in this section."* rather than producing an empty register.

---

## ADR-085 · A draft counts towards nothing; only submitted registers do

**Status:** Accepted · 2026-08-30

**Context.** A register is created before it is correct. If drafts counted, a percentage would change under the reader while a teacher was still calling names, and a cancelled class would mark a whole section absent for a public holiday.

**Decision.** Every percentage query filters on `SUBMITTED`. The rule is one exported constant used by all of them, rather than a status retyped into each `where` clause.

Entries are created **defaulted to PRESENT**, which is how a paper register works: names are called and the absentees are marked. That default is only safe because of the rule above — a draft is invisible to every report until somebody deliberately submits it. The create call also accepts statuses directly, so a teacher marking as they go needs no second round-trip.

A student with no counted sessions gets a percentage of `null`, not `0`. Zero reads as "never attends", which is a very different and much worse claim than "no classes have been held yet".

**Consequences.** Verified end to end: cancelling a submitted register moved a student from 1 session at 100% to 0 sessions at `null`, while three draft registers in the same database contributed nothing.

---

## ADR-086 · Teachers mark today; the office marks history — and history keeps the teacher's name

**Status:** Accepted · 2026-08-30

**Context.** The college had no rule about backdating. Unrestricted backdating lets a teacher rewrite a term; no backdating at all makes it impossible to enter a paper register, which a college genuinely needs.

**Decision.** Nobody may mark a future date. Teachers may mark **today only** (`TEACHER_BACKDATE_DAYS = 0`, one constant to widen later). Administrators may mark **any past date**.

The office entering a paper register names the **teacher who actually took it**, through an admin-only `markedByStaffId`. A teacher's own register is always attributed to them and that field is ignored for them, so nobody can file a register under a colleague's name.

This last part was added because testing found the rule incomplete: the date policy says "ask the office", but an administrator with no staff record of their own could not create a register at all, and attributing one to an arbitrary teacher would have put a name on work they did not do.

**Consequences.** Verified: a teacher backdating by one day got 400 naming the office; an administrator backdating for a named teacher got 201 with the register attributed to that teacher; a teacher sending someone else's staff id still had the register recorded against themselves.

---

## ADR-087 · "My attendance" has no student id anywhere in it

**Status:** Accepted · 2026-08-30 · the same reasoning as ADR-071's first rule

**Context.** The usual way this leaks is `/api/attendance?studentId=…` with a check that some later refactor drops.

**Decision.** `getMyAttendance(ctx, options)` takes no student id at all. The student is read from `ctx.studentId`, which comes from the session cookie. There is no parameter to tamper with, in the route, the validation schema, or the service signature — so the "change the id and see someone else's record" attack has nothing to attack. A login with no linked student record is refused rather than shown an empty page, so the failure is legible.

**Consequences.** Verified: appending `studentId` to the query changed nothing, two students received their own separate records, and a student was refused a register by id with 403.

---

## ADR-088 · Audit records the status change and the student code — nothing else

**Status:** Accepted · 2026-08-30

**Context.** Attendance corrections are exactly the kind of change that needs a trail. They are also attached to free-text remarks, which teachers use for things like *"at hospital"*.

**Decision.** Four actions — `attendance.sheet_created`, `attendance.submitted`, `attendance.corrected`, `attendance.sheet_cancelled` — written inside the same transaction as the change. A correction records `before: { status }`, `after: { status }` and the **student code**. Remarks are never audited, full names are never audited, and a roster is never audited.

**Consequences.** Verified on a database with 15 attendance audit entries: every action type present, before/after statuses recorded, students identified as `DEMO-STU-0001`, and a scan for remarks or names in the audit payloads returned zero rows.

---

## ADR-089 · The register is marked with four buttons, not a dropdown

**Status:** Accepted · 2026-08-30

**Context.** A teacher marks forty students in the minute before a lesson starts. A `<select>` per student is two clicks and a menu to read, forty times over. That is the difference between a screen people use and one they work around.

**Decision.** A segmented control of four buttons — Present, Absent, Late, Leave — one click each. Underneath it is a proper `radiogroup` with `aria-checked`, so arrow keys move between the options and a screen reader announces both the group and the choice. Each option's accessible name includes the student, so "Absent" is never ambiguous in a list of forty.

Every status carries an **icon and a word** as well as a colour. Colour alone is unreadable for a colour-blind teacher and useless on a photocopy. On a narrow screen the words shorten to P/A/L/Lv while the accessible names stay in full.

Bulk actions ("Mark all present", and marking the selected students) update the table immediately and say what they did. Nothing changes out of sight, so no confirmation dialog is needed for something the user can see and undo before saving.

**Consequences.** Sixteen component tests cover the rules that matter: that each status appears in words, that the picker reports changes rather than owning them, and that a disabled register cannot be marked.

---

## ADR-090 · The screen never computes a percentage

**Status:** Accepted · 2026-08-30 · protects ADR-079

**Context.** The percentage rule is subtle — LATE counts as attended, LEAVE does not unless a setting says otherwise. Any second implementation of it will eventually disagree with the first, and the two will be reported side by side.

**Decision.** `AttendanceSheetDetail` carries a `percentage` field computed by the service using the college's own rule and its setting. The screen displays it. The only arithmetic in the browser is the running head-count while a teacher is still marking, which is explicitly *not* a percentage and is labelled "Not counted yet" until the register is submitted.

A register with nothing counted shows **"No attendance recorded yet"**, never `0%` — zero reads as "never attends", which is a different and much worse claim.

**Consequences.** The list gained a per-register summary too, counted in **one grouped query for the whole page** rather than one per row: a page of 25 registers costs two queries, not twenty-six.

---

## ADR-091 · The screen mirrors the API's rules; it does not enforce them

**Status:** Accepted · 2026-08-30

**Context.** It is tempting to treat a hidden button as a security control. It is not one — anyone can call the API directly.

**Decision.** Buttons follow the permissions the server reported (`attendance.create`, `attendance.update`, `attendance.update_submitted`), so nobody is offered an action that would be refused. Correcting a submitted register additionally requires turning correction **on** explicitly, so a stray click cannot alter a register that has already been handed in.

None of that is the control. Every action calls the API, which decides again from the database.

**Consequences.** Verified both halves against a production build: revoking `attendance.create` removed the button from the page *and* the API answered a direct request with 403 and *"You do not have permission to mark attendance."*

---

## ADR-092 · The teacher is offered their assignments, never a picker

**Status:** Accepted · 2026-08-30

**Context.** The admin attendance screen starts with six dropdowns — session, class, division, program, section, subject. A teacher standing in front of a class does not need any of them: they teach one or two things, and they know which.

**Decision.** `/staff/attendance` lists exactly what this teacher may mark, built on the server by `getMyMarkingOptions` from their own ACTIVE records — `teacher_assignments` for subjects, `section_incharges` for daily roll-call. Subjects and daily roll-call are shown under separate headings, because they are different rights, not different flavours of the same one.

There is no section id, subject id or staff id anywhere in the interface, so there is nothing for a teacher to substitute. Starting a register sends only ids that came from that server-built list, and `assertCanMarkAttendance` checks the same facts again anyway.

The same call reports which registers already exist for today, so a teacher who has already marked period 1 is offered "Continue draft" or "View register" rather than a duplicate — with the database constraint still behind it as the real guarantee.

**Consequences.** Verified against a production build: a teacher assigned only Biology was offered Biology and their in-charge section, opened both, and the staff-portal section list showed `subjects=["Biology"]` — Chemistry, which is in the same curriculum, was never offered.

---

## ADR-093 · The teacher's register is narrower than the office's, on purpose

**Status:** Accepted · 2026-08-30

**Context.** It would be less code to reuse the admin register screen. It would also hand every teacher a Cancel button and a correction mode.

**Decision.** A separate, simpler screen. Mark, save, submit — and nothing else. No cancel, no correction, no filters. A submitted register shows *"Submitted attendance cannot be edited. Please contact the office."* and offers no controls at all.

Marking is built for a phone: a single scrolling list rather than a table, large targets, and a **sticky action bar** so Save and Submit stay in reach. With a row focused, **P / A / L / E** set the status — an addition to the buttons, never a replacement, so nothing depends on a keyboard.

The screen never claims a save the server did not confirm: the status line moves through *Unsaved changes → Saving… → Saved*, and a failure says *"Unable to save attendance. Please check your connection."* while keeping the teacher's marks on screen. A `beforeunload` guard warns before a refresh would lose them.

**Consequences.** 34 component tests, including that a submitted register offers no `radiogroup`, no Save and no correction button, and that a failed save never displays "Saved".

---

## ADR-094 · "Reviewed" is a UI idea; the database has no unmarked state

**Status:** Accepted · 2026-08-30 · completes ADR-085

**Context.** A register arrives with everyone marked Present (ADR-085). That is how a paper register works, but on screen "nobody has checked this yet" and "everyone was present" look identical — and a teacher could submit a full-attendance register without reading a single name.

**Decision.** The screen tracks which students the teacher has actually touched, and the submit dialog says so: *"2 students still have the default mark of Present. Check they were all there before submitting."* Once every student has been touched it says *"Ready to submit."*

This is deliberately **client-side only**. Adding an `UNMARKED` status to `attendance_status` would mean a migration, a fifth case in every count and percentage, and a state that could reach the database and mean nothing. What is being tracked is not a fact about the student — it is a fact about this editing session.

**Consequences.** The warning is advisory: submission is not blocked, because a teacher who calls the register aloud and finds everyone present should not have to touch forty rows to prove it. The default is honest and visible either way.

---

## ADR-095 · "My attendance" has no student parameter, and the page has no controls

**Status:** Accepted · 2026-08-30 · realises ADR-087 in the interface

**Context.** A student attendance page is the classic place for two bugs: an id in the URL that can be edited, and a write endpoint reachable from a read-only screen.

**Decision.** Neither exists to be exploited. `getMyAttendance(ctx, query)` takes no student id; the query schema has no field for one; the route reads none. A `?studentId=` is simply not parsed, so there is nothing to tamper with rather than a check that a later refactor could drop.

The page itself contains no control that changes anything — no marking, no save, no submit, no cancel, no correction. A test asserts that: it collects every button on the page and fails if any is labelled mark, submit, cancel, correct or save.

A student login not linked to a student record gets a plain explanation, never a 500 and never somebody else's record.

**Consequences.** Verified with two students holding genuinely different records: `?studentId=` changed nothing, the other student's name appeared nowhere in the response, and create, edit, mark, submit, cancel and reading a register directly were all refused.

---

## ADR-096 · The student's figures are counted by the database, and daily roll-call stays separate

**Status:** Accepted · 2026-08-30

**Context.** The first version of the subject breakdown loaded every one of a student's entries and tallied them in JavaScript. A student accumulates a few thousand entries a year, and Prisma's `groupBy` cannot group by a column on a joined table.

**Decision.** One grouped SQL statement with `COUNT(*) FILTER (WHERE …)` per status, grouped by the sheet's subject. The history is separately paginated, so a student with three years of attendance never loads all of it to see last week.

**Daily roll-call is kept out of the subject list.** It appears as its own summary with its own percentage, never folded into Biology's figures — the two answer different questions, and mixing them would quietly inflate or deflate a subject.

The subject filter offers only subjects that actually appear in that student's history, so it never advertises a subject they have no attendance for.

**Consequences.** Verified: with three submitted registers, one draft and one cancelled, the student's total was **3** — drafts and cancellations counted for nothing — and the subject list held Biology and Physics while daily roll-call sat on its own.

---

## ADR-097 · Refuse before you look anything up

**Status:** Accepted · 2026-08-30

**Context.** Testing the student page against the real database turned up something small but real: `POST /api/v1/attendance/sheets` with a section id that does not exist returned **404**, while a real section id returned **403**. A student could tell valid section ids from invalid ones by the status code alone, and every probe cost a database query.

**Decision.** `assertCanMarkAttendance` now settles the part it can answer from the session — does this person hold `attendance.create`, and are they staff or an administrator — **before** loading the section, the subject or the curriculum. Anyone who could never mark attendance gets the same 403 whatever they name.

**Consequences.** A student now gets 403 for both a real and an invented section id. Re-ran the full teacher workflow afterwards to confirm the earlier check did not break the path it guards: 23/24, unchanged.

---

## ADR-098 · One grouped query at the timetable's grain, then arithmetic

**Status:** Accepted · 2026-08-30

**Context.** The obvious way to build "attendance by class, by division, by program, by section and by subject" is five queries, or worse, a loop that asks per class. Both scale with the college; neither survives a second year of data.

**Decision.** One statement returns counts at the **(section × subject)** grain, joined to the class, division and program names. That result set is bounded by the *timetable* — twenty sections times a handful of subjects — not by the number of students or attendance entries. Every breakdown the page shows is then a roll-up over a few dozen rows in memory, which is arithmetic, not a query.

Counting uses `COUNT(*) FILTER (WHERE status = …)`, so one pass over the index produces all four status counts.

**Consequences.** Measured against 12,013 attendance entries, 807 registers and 303 students: the summary costs **3 SQL statements** (two aggregates and one settings read) in about 200 ms, and returns **6.4 KB** — a payload that does not grow with the data. The student report costs 3 statements, and **page 5 costs exactly the same as page 1**, which is what "no N+1" looks like when you measure it rather than assert it.

No index was added. The existing `(section_id, date)`, `(academic_session_id, date)` and `(student_id, academic_session_id, date)` indexes from ADR-078 already cover these access paths.

---

## ADR-099 · A teacher's report scope is a SQL clause, not a filtered result

**Status:** Accepted · 2026-08-30 · the reporting counterpart of ADR-083

**Context.** Reporting is where scope leaks. It is easy to fetch the college's figures and then remove the rows a teacher should not see — and just as easy for the totals, or one breakdown, to be computed before that filter runs.

**Decision.** Scope is an `EXISTS` clause ANDed into **every** reporting statement:

```sql
EXISTS (SELECT 1 FROM teacher_assignments … WHERE section = sh.section_id AND subject = sh.subject_id)
OR (sh.subject_id IS NULL AND EXISTS (SELECT 1 FROM section_incharges … ))
```

Because it is part of the WHERE clause, a teacher's own filters can only ever *shrink* what they see. Asking for a section they do not teach returns zero rows rather than someone else's figures, and there is no intermediate result containing data they should not have.

Reports are refused outright for students: their own attendance lives at `/student/attendance`, which answers a different question. Handing them an empty report would only look like a bug.

**Consequences.** Verified with a teacher who taught Biology in one section and was in charge of it: they saw 6 of the college's 9 records, Physics never appeared in their subject breakdown, and requesting the other section or Physics by id returned zero. Students receive 403.

---

## ADR-100 · No attendance threshold was invented

**Status:** Accepted · 2026-08-30

**Context.** Attendance reports usually grow a "students below 75%" list. Pakistani boards do commonly require 75%, and it would have been easy to hard-code.

**Decision.** The application has **no configured attendance threshold** — I checked the settings table before building. Rather than inventing a policy the college has not set, the student report sorts by **lowest attendance first** by default, which answers the same practical question ("who needs attention?") without the system asserting a rule nobody chose.

Students with no counted sessions sort to the bottom (`NULLS LAST`) instead of appearing as 0%, which would put "no classes held yet" at the top of a list of concerns.

If the college later configures a threshold, the report can grow a "below requirement" view that reads it — and it will be their number, not one this project chose for them.

**Consequences.** Sorting happens in SQL, so the lowest attendance in the whole selection reaches page one — sorting a page in JavaScript would only order the twenty-five rows that happened to come back.

---

## ADR-101 · Marks and results stay in PostgreSQL, never in Google Drive

**Status:** Accepted · 2026-08-30

**Context.** Phase 6 connected Google Drive for document storage, and Drive is free. It would be tempting to keep result sheets there too.

**Decision.** Every mark and every result lives in PostgreSQL. Google Drive is for *files a person uploaded* — a photograph, a scanned B-Form. It is never the store of record for academic data.

A result has to be queried, ranked, recalculated and audited. None of that is possible against a file in a folder, and a Drive outage or a revoked token would make a student's marks unreadable. Marks also change through a workflow with an audit trail; a file has no such thing.

**Alternatives.**
- *Result PDFs on Drive* — fine as an eventual export, useless as the source. A generated PDF is a view of the data, not the data.
- *A spreadsheet per class on Drive* — how many colleges do it today, and exactly the fragility this project exists to remove.

**Consequences.** The exam tables carry no Drive identifiers at all. When result cards are exported in a later phase, the file will be produced *from* the database, and the database will remain the answer to "what did this student score?"

---

## ADR-102 · A mark's status and its value are held together by the database

**Status:** Accepted · 2026-08-30

**Context.** The college confirmed that an absent student scores zero. The obvious implementation — write 0 — destroys information: nothing then distinguishes "did not turn up" from "sat the paper and scored nothing", and nothing distinguishes either from "nobody has entered this mark yet".

**Decision.** `marks` carries a `status` of `PENDING`, `ENTERED` or `ABSENT` alongside `obtained_marks`, and a CHECK constraint keeps the two honest:

```sql
CHECK (
  (status = 'PENDING' AND obtained_marks IS NULL)
  OR (status = 'ENTERED' AND obtained_marks IS NOT NULL)
  OR (status = 'ABSENT'  AND obtained_marks IS NOT NULL AND obtained_marks = 0)
)
```

A missing mark can never be read as a zero, an absence always scores zero, and no service bug can quietly turn one into the other.

The repeated `IS NOT NULL` in the last branch is not redundant. A CHECK rejects a row only when it evaluates to FALSE, and `NULL = 0` is NULL, not FALSE — without it, an `ABSENT` row with no mark at all would have been accepted. The schema test caught this before the migration reached the college's database.

**Alternatives.**
- *A separate `is_absent` boolean* — two columns that can disagree, and no natural place for "not entered yet".
- *A negative sentinel such as −1* — arithmetic would silently include it.

**Consequences.** The marks-entry screen must always send a status. Reports can count absences directly rather than inferring them from zeros, and "0" on a result card means the student was there.

---

## ADR-103 · A grade is chosen by the band's lower bound

**Status:** Accepted · 2026-08-30

**Context.** The college's scale reads A+ 90–100, A 80–89, B 70–79, C 60–69, D 50–59, F below 50. Marks are decimals, so a student on 89.5% falls in the gap between "A up to 89" and "A+ from 90" and would have no grade at all.

**Decision.** `findGrade` matches on `min_percentage` only, taking the highest band the mark reaches. 89.5% is an A. The seeded upper bounds are written as 89.99, 79.99 and so on — the true largest value below the next band, given percentages are stored to two decimal places — and exist for display.

**Alternatives.**
- *Round to a whole number first* — 89.5 would round to 90 and become an A+, promoting a student the college's own boundary excludes.
- *Store the bands exactly as written and reject the gaps* — correct-looking data, a system that cannot grade real marks.

**Consequences.** Bands must be contiguous from 0 for every mark to grade; a scale that starts at 50 returns null rather than inventing a grade. An admin editing the scale only needs to get the lower bounds right.

---

## ADR-104 · An INCOMPLETE result is never given a position

**Status:** Accepted · 2026-08-30

**Context.** The college confirmed that a student who joined mid-session, and so has papers with no marks, is INCOMPLETE. Such a student still has a total — it is simply a total of fewer papers.

**Decision.** Ranking skips INCOMPLETE results entirely: `assignPositions` returns null for them, and they do not consume a position, so the classmates around them are unaffected. The database enforces it too, with `CHECK (outcome <> 'INCOMPLETE' OR position IS NULL)`.

Ranking an incomplete student either way would be a false statement. Placing them by their partial total puts them last for work nobody has marked; scaling their total up to a full exam invents marks they have not earned.

**Alternatives.**
- *Rank them among everyone* — publishes a position that is wrong by construction.
- *Exclude them from the result altogether* — they would have no result card, and their marks so far would be invisible to them.

**Consequences.** An INCOMPLETE result still shows its subjects, its total and its percentage out of the whole exam, so the figure can only rise as the remaining marks arrive. It carries no grade and no position until it is complete.

---

## ADR-105 · Pass and fail are decided by exact arithmetic, never by the rounded percentage

**Status:** Accepted · 2026-08-30

**Context.** A percentage is stored as DECIMAL(5,2) and shown to two places. 149.99 out of 300 is 49.9966…%, which displays as **50.00**. If the pass rule read that displayed value, the student would pass on 50% having scored less than half.

**Decision.** All arithmetic happens in integer hundredths — 82.50 is 8250 — and every threshold comparison is cross-multiplied rather than divided:

```ts
obtainedHundredths * 10_000 >= thresholdHundredths * maxHundredths
```

That answer is exact whatever the division would have produced. The rounded percentage is computed separately, and only for storage and display. Grades are decided the same way, so a mark that displays as 90.00 but has not reached 90 is an A, not an A+.

Integers also avoid floating point outright: `0.1 + 0.2 !== 0.3` in JavaScript, and marks get added together constantly.

**Alternatives.**
- *A decimal library such as decimal.js* — correct, but a dependency for arithmetic that fits in ninety lines, and every value here is already a whole number of hundredths.
- *Compute in JavaScript numbers and round at the end* — the bug above, plus drift on long additions.

**Consequences.** Values cross the boundary as strings (`'82.50'`), never as floats. `toHundredths` refuses anything with a third decimal place instead of rounding it, so a bug upstream surfaces immediately rather than being quietly absorbed.

---

## ADR-106 · The calculation has no database access at all

**Status:** Accepted · 2026-08-30

**Context.** Result calculation is the part of this system that is hardest to get right and most expensive to get wrong, and it is the part a college will argue about.

**Decision.** `src/server/exams/grading.ts` and `exact.ts` import nothing but each other. No Prisma, no request, no clock. Every input is passed in; every output is returned. The service does the lookups and calls these; the routes call the service — the same shape as the attendance policy in Phase 7.

**Alternatives.**
- *Calculate inside the service, next to the queries* — fewer files, but every boundary test then needs a database, and the rules end up scattered through query code.
- *Calculate in SQL* — fast, but the rules become invisible to a beginner and impossible to unit test.

**Consequences.** 38 tests cover the rules with no database and run in 17 milliseconds, which makes it cheap to test each boundary at the value, one hundredth below and one hundredth above. When the college changes a rule, there is one file to change and one file to re-read.

---

## ADR-107 · Results are versioned, and exactly one version is current

**Status:** Accepted · 2026-08-30

**Context.** A mark gets corrected after results are published — a transposed digit, a missed answer sheet. The result must change, but the fact that a different result was published, and what it said, must not disappear.

**Decision.** `results` has `version` and `is_current`. Regenerating writes a new row at the next version and clears the flag on the old one; nothing is overwritten and nothing is deleted. A partial unique index enforces the invariant:

```sql
CREATE UNIQUE INDEX results_exam_id_student_id_current_key
  ON results (exam_id, student_id) WHERE is_current;
```

Two current results for one student cannot exist even if two admins press the button simultaneously.

**Alternatives.**
- *Update the row in place* — the published figure vanishes, and a parent holding a printed card cannot be answered.
- *Keep history only in the audit log* — an audit entry records that something changed, but cannot be queried as a result.

**Consequences.** Reads must filter on `is_current`. The superseded row stays available for "what did we publish in July?", which is the question that actually gets asked.

---

## ADR-108 · A result stores the names it was printed with

**Status:** Accepted · 2026-08-30

**Context.** A result card names a student, a father, a class, a programme, a section and an exam. All of those live in tables an admin may edit, and sections get renamed between sessions.

**Decision.** A `Result` row snapshots the names it was generated with — student name, father's name, roll number, class, division, programme, section, session and exam — alongside the ids. Reprinting a result from March reproduces the card as it was, not as the structure looks today.

**Alternatives.**
- *Join to the live tables on every read* — last year's card silently acquires this year's section name, and a result that has already gone home changes without anyone touching it.
- *Freeze the underlying rows* — the college could then never fix a spelling mistake.

**Consequences.** Some duplication, on rows that are written once and read often. Snapshots are display text only; the ids remain the way to navigate to the live record. Nothing sensitive is snapshotted — no CNIC, no B-Form, no document reference.

---

## ADR-109 · "Every programme" is a NULL that still has to be unique

**Status:** Accepted · 2026-08-30

**Context.** A paper usually belongs to one programme, but English is sat by every programme in a class. Modelling that as `program_id IS NULL` reads naturally — and breaks uniqueness, because PostgreSQL treats each NULL as distinct. Two identical "English for everyone" papers would both be accepted, and every student would then have two English marks.

**Decision.** The key is declared `UNIQUE NULLS NOT DISTINCT (exam_id, class_id, subject_id, program_id)`, available since PostgreSQL 15 — the college's Neon database runs 18.6. Prisma cannot express it, so it is written by hand in the migration and asserted by a schema test that reads `pg_indexes`, so a future regeneration cannot drop it unnoticed.

**Alternatives.**
- *A sentinel programme row called "All"* — pollutes a list the admin manages and needs special-casing everywhere.
- *Enforce it in the service* — two concurrent requests both pass the check and both insert.

**Consequences.** One shared paper per subject per class, or one per programme, and never both by accident.

---

## ADR-110 · Migrations run on the unpooled connection

**Status:** Accepted · 2026-08-30

**Context.** Applying this migration through Neon's pooled endpoint failed halfway with `P1017 Server has closed the connection`. The eight tables existed; the sixteen foreign keys, eleven CHECK constraints and ten indexes that came after the failure point did not. Prisma's bookkeeping row was left unfinished, and — because `pg_advisory_lock` is session-scoped while pgbouncer's server session outlives the client — the migration lock leaked and blocked the retry.

A half-applied migration is worse than a failed one: the schema looks present and silently accepts data the constraints were meant to refuse.

**Decision.** `prisma.config.ts` uses `DATABASE_DIRECT_URL` when it is set, falling back to `DATABASE_URL`. The application keeps using the pooled connection; only `prisma migrate` uses the direct one. On Neon the direct host is the pooled host with `-pooler` removed.

**Alternatives.**
- *Split the migration into smaller files* — reduces the odds without removing the cause, and a pooler can drop any of them.
- *Retry on failure* — retrying a partially applied migration is exactly what must not happen.

**Consequences.** `.env.example` documents the variable and why it exists. The damaged migration was repaired without dropping anything: the statements whose objects were genuinely absent were replayed in one transaction, and the result was diffed — columns, indexes and constraints — against a clean replay of all seven migrations in PGlite until the two matched exactly.

---

## ADR-111 · The teacher publishes a mark sheet; the office publishes a result

**Status:** Accepted · 2026-08-30

**Context.** The confirmed workflow is DRAFT → SUBMITTED → PUBLISHED, with no locked and no verified state. Read one way, the teacher publishes; read against the staff permission list, teachers hold marks permissions while `results.generate` and `results.publish` sit with administrators.

**Decision.** They are two different acts on two different things. A teacher owns the *mark sheet*: they enter marks, submit them, and their subject's marks become final. An administrator owns the *result*: generating it gathers every subject, applies the rules, ranks the students, and publishing it makes it visible to the student.

That is why `ExamMarkSheet` and `Result` have separate status enums rather than sharing one.

**Alternatives.**
- *One status across both* — a teacher submitting Biology would have to be prevented from publishing a result that depends on Chemistry, which nobody has marked.

**Consequences.** A student sees nothing until the office publishes, however many teachers have finished. Authorization reuses the existing `TeacherAssignment` records from Phase 5 — no second teacher-subject system.

---

## ADR-112 · Only the confirmed grading scale is seeded

**Status:** Accepted · 2026-08-30

**Context.** The exam tables need reference data before an exam can be created: a grading scale, and exam types such as "First Term" or "Send-Up". The college confirmed the grading scale exactly. It confirmed nothing about exam types.

**Decision.** The reference seed creates one grading scale — A+ 90, A 80, B 70, C 60, D 50, F 0, marked default — and nothing else. The bands carry no remarks text, because "Excellent" and "Satisfactory" were not confirmed either. Exam types are left empty for the Admin to enter.

**Alternatives.**
- *Seed the usual Pakistani exam types* — plausible, and precisely the invention the brief forbids. A college with different terms would have to delete them first.

**Consequences.** Before the first exam, an admin must add at least one exam type. The seed stays idempotent: running it again reports the scale as already existing and never overwrites an edited band.

---

## ADR-113 · Publishing the date sheet is what makes an exam SCHEDULED

**Status:** Accepted · 2026-08-31

**Context.** The date sheet needs a published state, and the obvious move is a `date_sheet_published` boolean or a second status column. `ExamStatus` already reads `DRAFT · SCHEDULED · MARKS_ENTRY · COMPLETED · CANCELLED`.

**Decision.** No new column. Publishing moves the exam from `DRAFT` to `SCHEDULED`, because "scheduled" is precisely what a published date sheet means. Everything from `SCHEDULED` onwards counts as published, since marks entry and completion both happen after a schedule has gone out; `isDateSheetPublished()` says so in one place rather than each screen deciding.

A boolean beside the status would have created states nobody wants to reason about — published but still a draft, scheduled but unpublished — and every read would have had to check both.

**Alternatives.**
- *A `date_sheet_published` boolean* — two sources of truth for one fact.
- *A separate `date_sheet_status` enum* — a lifecycle of its own for something that has exactly two states, both already implied by the exam's.

**Consequences.** No migration for this stage. The publish endpoint is the only thing that writes `SCHEDULED`, and the status endpoint refuses to — verified: `PATCH /api/v1/exams/:id { status: 'SCHEDULED' }` returns 400.

---

## ADR-114 · A published date sheet is frozen, and withdrawal is its own audited act

**Status:** Accepted · 2026-08-31

**Context.** Once a date sheet is out, students have written the dates in a diary and teachers have planned around them. Silently allowing an edit is how a student turns up on the wrong morning.

**Decision.** While an exam is `SCHEDULED` or beyond, adding, editing and removing papers are all refused, as is editing the exam and deleting it. The way back is **Withdraw date sheet** — a separate action, with its own confirmation, its own audit entry (`date_sheet.withdrawn`), and wording that says nobody will be told the schedule changed.

`loadEditableExam()` is the single gate: every write path calls it, so a new endpoint cannot forget the rule.

**Alternatives.**
- *Allow edits and re-publish quietly* — the schedule changes with no trace and no signal.
- *Never allow changes* — real colleges move exam dates, and the answer cannot be "create a second exam".

**Consequences.** Verified against a throwaway database: with the sheet published, adding, editing and removing a paper, editing the exam, deleting it and publishing twice all return 409; withdrawing returns 200 and the papers become editable again. Marks entry closes the door for good — a `MARKS_ENTRY` exam cannot be withdrawn either.

---

## ADR-115 · A paper's subject comes from the curriculum, not from a list of every subject

**Status:** Accepted · 2026-08-31

**Context.** The subject dropdown could simply list the college's subjects. It would then be possible to set a Biology paper for a programme that does not study Biology, and every student in it would be marked absent for a subject they never took.

**Decision.** `getPaperOptions()` returns, for one session, each class with its programmes and **each programme's curriculum subjects**. The dropdown narrows from there, and the server re-checks the same rule in `checkPaperScope()` — the browser's choice is a convenience, never the authority.

A paper for the whole class (`program_id IS NULL`) is held to a stricter test: the subject must be on **every** programme's curriculum in that class. English qualifies; Biology does not.

**Alternatives.**
- *List all subjects and let the admin be careful* — the mistake is invisible until results are generated.
- *Check only in the browser* — a forged request would sail past it.

**Consequences.** Verified: Pre-Medical offers exactly its four curriculum subjects; only English and Urdu can be set as a whole-class paper; a Biology paper for Pre-Engineering is refused with a field-level message. A class whose curriculum is empty offers nothing and says so, rather than offering everything.

---

## ADR-116 · Clash detection refuses the impossible, and nothing more

**Status:** Accepted · 2026-08-31

**Context.** A date sheet can be wrong in many ways. Building a timetable engine to catch them all would be a project of its own, and would start refusing schedules a college actually wants.

**Decision.** Two things are refused, both because a single student could not physically do them:

- **the same subject twice** for overlapping students — including the case where a whole-class paper and a programme paper cover the same student, which would give them two marks for one subject;
- **two papers at overlapping times** on the same day for overlapping students.

Everything else — a heavy week, no gap between papers, a Sunday — is the college's business. A paper with no time yet clashes with nothing, so subjects can be entered first and timetabled afterwards.

`findDateSheetProblems()` re-runs the same check across the whole sheet at publish time, because a paper saved before its neighbour existed could still leave two on top of each other.

**Alternatives.**
- *Warn instead of refuse* — a warning on a screen nobody re-reads is not a safeguard.
- *A full timetable engine with rooms and invigilators* — out of scope, and the college has not asked.

**Consequences.** Verified: Mathematics for Pre-Engineering and Biology for Pre-Medical are accepted at the same time on the same day, because no student sits both; Chemistry for Pre-Medical at an overlapping time is refused. Publishing is refused while any overlap remains, and the message names both subjects.

---

## ADR-117 · A paper carries its own passing percentage, and the screen never reads today's rule

**Status:** Accepted · 2026-08-31

**Context.** The college passes at 50%. If that ever changes, every exam already held must still be read against the rule that applied when it was held.

**Decision.** `exam_papers.passing_percentage` is written when the paper is created, defaulting to 50, and the exam screens display **that stored value** — never a current global setting. The same goes for maximum marks. Marks travel as strings from form to DECIMAL column, so a percentage is never parsed into a float on the way (ADR-105).

**Alternatives.**
- *Read the college's current pass mark when displaying an old exam* — last year's results would silently change meaning.

**Consequences.** Verified: `87.50` entered as a maximum comes back as `87.50`; `87.555` is refused rather than rounded; `0`, negative and over-100 values are refused with field messages rather than a 500 — which took a fix, because a Zod `.refine` still runs after a failed `.regex`.

---

## ADR-118 · Exam types are reference data, and reuse the exam permissions

**Status:** Accepted · 2026-08-31

**Context.** Exam types need a management screen. Two questions followed: where it lives, and what permission guards it.

**Decision.** It lives at `/admin/academics/exam-types`, beside Departments and Designations, and reuses the same `ResourceManager` those screens use — a college that adds "Send-Up" gets it in the exam form immediately, with no code change.

It is guarded by the existing `exams.view` and `exams.manage`. **No new permission was created.** A screen-shaped permission would have to be granted to somebody by hand before the screen worked, and it would say nothing that `exams.manage` does not already say.

Deleting an exam type that any exam refers to is refused; deactivating hides it from new exams while every past exam keeps the name it was held under.

**Alternatives.**
- *`/admin/exams/types`* — a static segment sitting beside `/admin/exams/[id]`, which reads as a route collision even though Next.js resolves it.
- *A new `exam_types.manage` permission* — more to grant, nothing more to say.

**Consequences.** Verified: staff and students are redirected from the screen and get 403 from the API; an administrator whose `exams.manage` is revoked can still read exams but cannot create an exam, publish a date sheet, or add an exam type.

---

## ADR-119 · The date sheet is built by a pure function, so the staff and student views can reuse it

**Status:** Accepted · 2026-08-31

**Context.** Only the Admin view is built in this stage, but teachers and students will read the same schedule. Building it inside the Admin screen would mean writing it twice.

**Decision.** `buildDateSheet()` and `findDateSheetProblems()` live in `src/server/exams/exam-policy.ts` with the rest of the scheduling rules — pure functions over rows the service has already fetched, importing no database and no request. `DateSheetView` is a presentational component with no `'use client'` marker, so either side of the boundary can render it.

A paper sat by the whole class appears in **every** programme's schedule, because a student looking up their own timetable wants all of it, not the programme-specific part.

**Alternatives.**
- *Group the papers in the Admin client component* — the staff and student views would each re-implement it, and the three would drift.
- *Group in SQL* — fast, invisible, and untestable without a database.

**Consequences.** 44 tests cover the rules with no database. The staff and student date-sheet screens, when they come, need a service function and a page — not a second copy of the schedule logic.

---

## ADR-120 · The PGlite test harness can render pages after all

**Status:** Accepted · 2026-08-31 · Corrects a note from Phases 6 and 7

**Context.** Since Phase 6 the verification harness — an embedded PostgreSQL exposed on a TCP port — could drive API routes but returned 500 for every page, always `P1017 Server has closed the connection` on the session lookup. That was recorded as a limitation of the harness and worked around by verifying page rendering against the real database.

**Decision.** It was not a limitation. `PGLiteSocketServer` accepts **one** connection unless told otherwise, and a page render needs its session lookup while another query is still in flight. Setting `maxConnections: 20` fixes it.

**Alternatives.**
- *Keep verifying pages against the real database* — it works, but every page test then needs a temporary account on the college's live data, and no page can be tested with content the college does not have.

**Consequences.** The exam detail screen was rendered with four real papers, two programmes and a shared paper — content that does not exist on the college's database and which nobody would want seeded there. Zero hydration errors and zero server/client boundary errors, the class of defect ADR-077 exists to catch. Future phases can verify screens fully before touching the real database.

---

## ADR-121 · Marks entry reuses the attendance authorisation rule exactly

**Status:** Accepted · 2026-08-31

**Context.** A teacher may only mark the papers they teach. The project already answers a nearly identical question for subject-wise attendance, and the temptation was to write a second, marks-shaped version of it.

**Decision.** `src/server/exams/marks-access.ts` is the same shape as `attendance/access.ts`: pure functions, no database, one decision per rule. The **fact** it decides on is the same record — an ACTIVE `TeacherAssignment` for that exact section *and* subject, the Phase 5 table. There is no second teacher-subject system, and no new permission: `marks.enter`, `marks.update` and `marks.update_submitted` already existed.

Section-level scope is deliberately not enough. It would let the Biology teacher mark Chemistry in a section they already teach, which is exactly the hole `getScopedSectionIds()` cannot close.

**Alternatives.**
- *Reuse `getScopedSectionIds()`* — answers "which sections", not "which subject".
- *A marks-specific assignment table* — two sources of truth for one fact, and an office that closes a teaching assignment would not close marking.

**Consequences.** Verified against a throwaway database: a teacher assigned Biology in one section is offered exactly that paper, and is refused Chemistry, English, the same subject in another section, and another teacher's sheet — at the API and at the page.

---

## ADR-122 · The roster is rebuilt from enrollments, never sent by the browser

**Status:** Accepted · 2026-08-31

**Context.** A mark sheet needs a list of students. The obvious shape is for the browser to send back the rows it was given, which is also how a caller adds a student who is not in the section, or quietly drops one.

**Decision.** Every read and every save rebuilds the roster from ACTIVE `StudentEnrollment` rows for that section and session. The request supplies **values**, never membership: a `studentId` that is not on the current roster is refused outright, and a student on the roster with no mark row is shown as `PENDING`.

That also handles a mid-session joiner without any special case. They appear on the sheet the moment they are enrolled, carrying no mark, and their `PENDING` row blocks submission until somebody looks at their paper — which is the honest outcome, not a silent zero.

**Alternatives.**
- *Trust the ids in the request* — the roster becomes whatever the client says.
- *Freeze the roster when the sheet is opened* — a student who joins next week is invisible, and the sheet is submitted without them.

**Consequences.** Verified: a student from another section, one whose enrollment has ended, and an invented id are all refused with a 400. A transferred-out student stops appearing without anything being deleted.

---

## ADR-123 · A save is one atomic request, or it is nothing

**Status:** Accepted · 2026-08-31

**Context.** A section has thirty to sixty students. One request per student would be sixty round trips over a college's connection, and would leave the sheet in an unknown state if the tenth failed.

**Decision.** `PATCH /api/v1/marks/sheets/:id` takes the whole sheet. Every row is validated **before** anything is written — unknown student, mark above the paper's maximum, a status that disagrees with its value — and one bad row rejects the entire save inside a transaction.

A half-saved sheet would be worse than a failed one: the teacher would have no way to tell which marks went in.

The browser matches this. A failed save does **not** refresh from the server: whatever was typed stays on screen, with the error above it, so a dropped connection never costs a teacher an hour of marking.

**Alternatives.**
- *One request per mark* — chatty, and partially applied by construction.
- *Save what is valid and report the rest* — the teacher cannot tell what landed.

**Consequences.** Verified: a save containing one mark of 900 out of 100 writes nothing, and the previously stored mark is unchanged. The UI test that matters most asserts that after a failed save both typed marks are still in their boxes.

---

## ADR-124 · Concurrent edits are detected, not locked

**Status:** Accepted · 2026-08-31

**Context.** Two people can hold the same mark sheet open — a teacher and the office, or a teacher on two devices. Whoever saves second would silently overwrite the first.

**Decision.** The browser sends `expectedUpdatedAt`, the sheet's timestamp as it last saw it. If the stored sheet has moved on, the save is refused with a **409** and a message telling the teacher to reload and look at the other person's marks before saving theirs.

That is optimistic concurrency: no lock table, no lease, no background job to expire anything — a single timestamp comparison inside the existing transaction, which is exactly the sort of thing the free-tier constraint rules out doing more expensively.

**Alternatives.**
- *Row locks or a lease table* — infrastructure and failure modes for a rare event.
- *Last write wins* — silently loses somebody's work, which is the outcome being prevented.

**Consequences.** Verified: saving twice with the same timestamp is refused the second time, and the first save survives intact. The field is optional, so a client that does not send it still gets the ordinary check that the sheet is a draft.

---

## ADR-125 · Opening the first mark sheet moves the exam to MARKS_ENTRY

**Status:** Accepted · 2026-08-31

**Context.** `ExamStatus` has a `MARKS_ENTRY` state that nothing set. Meanwhile the step-3 rule that a published date sheet may be withdrawn only from `SCHEDULED` already carried the message *"Marks have already been entered against this exam"* — a promise nothing kept.

**Decision.** Opening the first mark sheet for an exam moves it from `SCHEDULED` to `MARKS_ENTRY`, in the same transaction, with its own `exam.status_changed` audit entry recording why.

From that moment the office can no longer withdraw the date sheet — which is right: once teachers are marking against a schedule, moving the schedule invalidates their work.

**Alternatives.**
- *Leave `MARKS_ENTRY` unused* — a state in the enum that never occurs, and a withdrawal rule whose message is a lie.
- *Have the admin move it by hand* — one more thing to forget, and the protection would arrive after the damage.

**Consequences.** Marking stays open for both `SCHEDULED` and `MARKS_ENTRY`, so the transition changes nothing for teachers. Verified: opening a sheet flips the exam, and the audit entry names the reason.

---

## ADR-126 · Marking is bounded by the exam's lifecycle, never by today's date

**Status:** Accepted · 2026-08-31

**Context.** It is tempting to refuse marks before the exam date, or after some window. Neither rule exists at Kabirian College.

**Decision.** Marks may be entered while the exam is `SCHEDULED` or `MARKS_ENTRY`, and at no other time. `DRAFT` means the date sheet has not gone out — or has been withdrawn — so the paper may still move. `CANCELLED` means the exam did not happen. `COMPLETED` means results are done, and reopening that is the office's decision.

There is **no rule about the calendar**. Inventing "you may only mark on or after the exam date" would refuse a teacher entering last week's papers on a Monday morning, which is when marking actually happens.

**Alternatives.**
- *Block before the exam date* — a rule the college has not asked for, breaking a normal workflow.
- *No lifecycle check at all* — marks against a withdrawn or cancelled schedule.

**Consequences.** Verified: a paper on a draft date sheet cannot be opened, and the refusal says which of the three reasons applies rather than a flat "no".

---

## ADR-127 · The teacher's screen keeps the three states apart

**Status:** Accepted · 2026-08-31

**Context.** ADR-102 made the database refuse a mark whose status and value disagree. A screen can still blur them: an input pre-filled with `0`, an "absent" checkbox that writes a zero, a blank that submits as nothing.

**Decision.** The screen mirrors the database exactly. An **empty box** is `PENDING` and shows "Not entered". A **number** is `ENTERED`. **Absent** is its own control, which clears the box, disables it, and sends a status — the zero is written by the server, not typed by anybody. Typing a mark for an absent student un-marks the absence, because both cannot be true.

A submitted sheet drops the Absent column entirely and shows the status once, rather than saying "Absent" twice in the same row.

Marks are checked against the paper's own maximum in the browser as well as on the server, so a teacher sees the problem on the row rather than after a round trip. The browser check is a convenience; the server's is the boundary.

**Alternatives.**
- *Pre-fill every box with 0* — the fastest way to freeze a blank into a record.
- *An "absent" checkbox that types 0 into the box* — the two facts become one number again.

**Consequences.** Submission is refused, in the browser and on the server, while any student is `PENDING`. 39 UI tests cover the states, the decimal marks, the disabled Save, the submitted view, and — the one that matters most — that a failed save leaves every typed mark on screen.

---

## ADR-128 · Results are generated for a whole exam, or not at all

**Status:** Accepted · 2026-08-31

**Context.** An exam's marks arrive one sheet at a time. It is tempting to let an administrator generate results for the students whose marks are in and fill in the rest later.

**Decision.** Generation is refused while **any** required mark sheet is unsubmitted, and the refusal names each one — subject, class, division, section, and whether it was never started or is still a draft. When it does run, the calculation happens entirely in memory first and the rows are written in one transaction.

A part-generated exam is worse than none: it is indistinguishable from a finished one. A student with no row looks the same as a student the office has not reached yet, and a pass rate computed over half a class is simply wrong.

A section only counts as required when a student is actually enrolled in it, so an empty section never blocks anything.

**Alternatives.**
- *Generate what is available and top up later* — every figure that depends on the cohort (the pass rate, and every position) would be wrong until the last sheet arrived, with nothing on screen saying so.
- *Warn instead of refuse* — a warning above a table of official results is not a safeguard.

**Consequences.** Verified against a throwaway database: with eight mark sheets outstanding the refusal lists them; with all in, six results are written in one transaction.

---

## ADR-129 · An incomplete result reports no percentage, grade or position

**Status:** Accepted · 2026-08-31 · Supersedes the interpretation reported in §22.26

**Context.** Phase 8 step 2 stored a percentage for an INCOMPLETE student — their marks out of the *whole* exam — on the grounds that the figure could only rise. The college has since decided the opposite: an incomplete result must show no percentage, no grade and no position at all.

**Decision.** `reportableFigures()` blanks all three whenever the outcome is INCOMPLETE, and every read goes through it. No screen, API response or future result card can show them by forgetting to check.

The underlying number is still **stored**. `results.percentage` is NOT NULL, and the value is real data — the only sensible thing to keep in that column. What changed is that nothing reports it.

**Alternatives.**
- *Make the column nullable* — the honest end state, but it needs a migration, and this stage was explicitly told not to change the database silently. It is reported as an open question instead.
- *Store 0.00* — a lie in the database rather than a lie on the screen.
- *Suppress it in each screen* — one forgotten check and a student sees a mark they did not earn.

**Consequences.** A student who joined after the exam appears with dashes and an "Incomplete" badge, and the breakdown says why. They consume no position, so their classmates are unaffected. **If the college wants the column itself to be nullable, that is a one-line migration and needs approval.**

---

## ADR-130 · Ranking never mixes programmes

**Status:** Accepted · 2026-08-31

**Context.** The `results.ranking_scope` setting has existed since Phase 0 with the values SECTION, GROUP and CLASS. Read literally, CLASS would rank a Pre-Medical student against a Pre-Engineering one.

**Decision.** All three scopes keep programmes apart. What they widen is division and section:

| Scope | Ranked against |
|---|---|
| `SECTION` | the same section |
| `GROUP` *(default)* | the same class, division and programme |
| `CLASS` | the same class and programme, across divisions and sections |

Two students on different courses sit different papers out of different totals. A position that compared them would be arithmetic without meaning, so it is not offered at any setting.

Positions are always calculated and stored. `results.ranking_enabled` describes itself as "show position/rank on results", so it governs what the student and staff screens display — a question for those screens, not for the calculation.

**Alternatives.**
- *Honour CLASS literally* — produces a number nobody should act on.
- *Ignore the setting and always use GROUP* — silently discards a configuration the college already has.

**Consequences.** Verified: two Pre-Medical students tie at first while a Pre-Engineering student with fewer marks is also first — in their own programme. `assignPositionsByScope` splits by scope key and ranks each set independently.

---

## ADR-131 · A correction supersedes; it never overwrites

**Status:** Accepted · 2026-08-31 · Applies ADR-107

**Context.** A mark gets corrected after results are out. The result has to change, but a parent holding a printed card must still be answerable.

**Decision.** Generating a second time is **refused** unless `regenerate` is explicitly set — so a stray double-click cannot supersede results anyone has seen. When it is set, the existing rows stop being current, a new version is written with the reason recorded on it, and every superseded version stays readable.

The new version starts as **DRAFT**. A corrected result is not republished automatically; somebody has to look at it and publish it again. The confirmation says so, and names how many published results will stop being visible.

**Alternatives.**
- *Update the rows in place* — the published figures vanish, and nobody can say what went home.
- *Carry PUBLISHED forward automatically* — publishes numbers nobody has checked, which is exactly what the publish step exists to prevent.

**Consequences.** Verified: generating twice returns 409; regenerating writes version 2, leaves version 1 readable, and returns everything to draft. A real correction — a Chemistry mark from 40 to 60 — turned a FAIL into a PASS, and the audit named that student alone.

---

## ADR-132 · A result's snapshot has no foreign keys, so filters resolve ids first

**Status:** Accepted · 2026-08-31

**Context.** `results.section_id`, `academic_group_id` and the printed names are snapshots (ADR-108). They are plain columns with no relations, so that renaming or deleting a section can never rewrite a published result. That also means a "filter by class" cannot be a join.

**Decision.** The class and programme filters resolve to a list of matching `academicGroupId`s in one cheap query, and the result set is narrowed by that list. The teacher-scoped read does the same with the teacher's own ACTIVE assignments.

**Alternatives.**
- *Add relations to the snapshot columns* — reintroduces exactly the coupling the snapshot exists to break, and a deleted section would cascade into examination history.
- *Filter in JavaScript after loading* — sends the whole exam to the server's memory to show twenty-five rows.

**Consequences.** One extra small query per filtered page. Verified that a published result survives its subject, programme and grading band all being renamed underneath it — the stored row still reads "Biology", "Pre-Medical" and "A+".

---

## ADR-133 · Result audit records counts, and names only what changed

**Status:** Accepted · 2026-08-31

**Context.** Generation touches every student. Writing an audit row per student would put thousands of entries in the log for one click; writing only "results generated" would say nothing useful about a correction.

**Decision.** One audit entry per action. `result.generated` and `result.published` record the counts — how many passed, failed and were incomplete, the version, and the ranking scope. `result.corrected` additionally records **which students actually moved**: their student code, and the outcome, total and grade before and after, capped at 200 entries.

Student **codes** only. No names, no father's name, no identity document, no Drive id, nothing from a student's file.

**Alternatives.**
- *An audit row per student* — unreadable at any real scale.
- *Counts only* — a correction that changed one student's result would leave no record of whose.

**Consequences.** Verified against the audit table: a regeneration that changed nothing recorded `changedCount: 0`; correcting one Chemistry mark recorded exactly one change, FAIL→PASS with the totals and the reason. A scan for CNIC, B-Form, father's name, password hashes, tokens, Drive ids and student names found none.

---

## ADR-134 · The percentage column follows the outcome

**Status:** Accepted · 2026-08-31 · Completes ADR-129

**Context.** ADR-129 established that an INCOMPLETE result reports no percentage, but `results.percentage` was created NOT NULL, so the partial figure was still *stored*. Suppression happened at the read boundary. That worked, and it was fragile: the misleading number sat in the column, one raw query away from being believed.

**Decision.** The column is nullable, and a CHECK constraint states the rule in both directions:

```sql
CHECK (
  (outcome = 'INCOMPLETE' AND percentage IS NULL)
  OR (outcome <> 'INCOMPLETE' AND percentage IS NOT NULL)
)
```

Nullable does not mean optional. A percentage is absent for exactly one reason and required for every other outcome, so neither a missing figure on a PASS nor a stray figure on an INCOMPLETE can be stored.

`outcome` is NOT NULL and `IS NULL` never evaluates to NULL, so the constraint is always TRUE or FALSE — there is no three-valued-logic gap of the kind the ABSENT branch of `marks_status_matches_value` fell into before it was fixed.

`reportableFigures()` now runs at **write** time as well as at read time: the same rule at both ends, rather than a rule and a mitigation.

**Alternatives.**
- *Keep NOT NULL and suppress on read* — what was there. The wrong number is still in the database.
- *Store 0.00* — a falsehood in the column rather than on the screen, and indistinguishable from a genuine zero.
- *Drop `results_percentage_valid`* — unnecessary: a CHECK only rejects what it evaluates to FALSE, so a NULL passes it untouched and the 0–100 bound still applies to every value that exists.

**Consequences.** One migration, two statements, one column. Verified on a throwaway PostgreSQL that the constraint refuses an INCOMPLETE row carrying a percentage *and* a PASS row without one, then end to end: the late-joining student is stored with NULL and the API serialises `null`, while every PASS keeps its two-decimal figure.

A database already holding INCOMPLETE results written by the previous code would need those rows normalised before this migration could be applied — the college's has none, and a fresh replay creates the table empty, so no data statement was added to the migration. It is recorded here in case a copy is ever restored.

---

## ADR-135 · A student's own results have no identity parameter

**Status:** Accepted · 2026-08-31

**Context.** Every read-your-own-data screen has the same failure mode: a
`studentId` that starts as a convenience and ends as the authorisation. Filtering
it out in the route works until somebody adds a second route.

**Decision.** There is no student id to send. `getMyPublishedResults(ctx)` and
`getMyPublishedResult(ctx, resultId)` take no such parameter, the query schemas
have no such field, and the identity comes from `ctx.studentId` on the session.
`?studentId=` has nothing to attach itself to at any layer.

The detail route takes a **result** id, not a student id, and a result belonging
to somebody else is reported as **not found** rather than as forbidden. A 403
would confirm the id exists, which is enough for one student to learn that
another has a result for an exam (ADR-097).

**Alternatives.**
- *Accept a studentId and check it matches* — correct until the check is
  forgotten once, and it invites a UI that passes it around.
- *Return 403 for another student's result* — leaks the existence of the row.

**Consequences.** Verified end to end: `?studentId=<classmate>` on both the list
and the detail route changes nothing, and student A opening student B's result
id gets the same 404 as opening a made-up one — while student B opens it
perfectly well.

---

## ADR-136 · A teacher sees a subject result, not a student's result

**Status:** Accepted · 2026-08-31

**Context.** A `Result` row is the whole student: every subject, the total, the
percentage, the grade, the position. A Biology teacher needs the Biology marks
of the students they teach. Handing them the row would also hand them the
student's Chemistry mark and their overall standing.

**Decision.** The staff screen returns **one row per student per subject the
teacher is assigned to teach in that section** — expanded from the stored
breakdown and filtered to their own assignments. `TeacherResultRow` carries no
overall outcome, no total, no position and no version; the fields it does carry
are named `subjectOutcome` and `markStatus` so nobody mistakes them for the
student's result.

Scope comes from ACTIVE `TeacherAssignment` records resolved from `ctx.staffId`
— the same records marks entry and subject-wise attendance use. Filters are
applied inside that scope, so asking for a section or subject they do not teach
returns nothing rather than somebody else's students (ADR-099).

Paging is by student: one page of results is fetched, then expanded. A teacher
normally teaches one subject per section, so a page is normally one row per
student.

**Alternatives.**
- *Return the whole result and hide columns in the UI* — the data is still in
  the response, and UI hiding is not security.
- *A separate teacher detail page* — there is nothing more to show; the row is
  the whole of what a teacher may see.

**Consequences.** Verified: a teacher assigned one subject in one section sees
only that subject and only that section; another teacher's section returns
nothing; and the response carries no field that would reveal the overall result.

---

## ADR-137 · The portals render the snapshot, and render it read-only

**Status:** Accepted · 2026-08-31

**Context.** Both portals show a result that may be months old. Recalculating
anything from the live curriculum, grade bands, subject names or enrolment would
quietly rewrite what a student was told.

**Decision.** Neither portal calculates anything. They render the stored
snapshot — subject names, maximums, grades, totals, position and the scale it
was graded on — exactly as `results.subject_breakdown` holds it (ADR-108).

Both are strictly read-only: no edit, publish, generate, correct or delete
control exists on either screen, and neither calls a mutating endpoint. Both
show **PUBLISHED** results only, so a draft, a withdrawn set, or a correction
nobody has published yet is simply absent rather than hidden.

The student list is a plain Server Component with no client JavaScript at all —
it has no filters to run — while the staff screen is a client component because
it needs them.

**Alternatives.**
- *Recompute for freshness* — the published result stops being a record of what
  the college published.
- *Show drafts greyed out* — a student reading a provisional mark as their result
  is exactly the harm publication exists to prevent.

**Consequences.** Verified by renaming the subject underneath an already-published
result: the student's page, the student's API response and the teacher's list all
continued to show the name the result was generated with. 21 UI tests assert the
display rules, including that no control on either screen matches a mutating verb.

---

## ADR-138 · The result card prints through the browser, and nothing else

**Status:** Accepted · 2026-08-31

**Context.** A printable result card usually arrives with a PDF library — Puppeteer, PDFKit, a hosted rendering service. Each is a dependency, a runtime, and in the hosted case a bill.

**Decision.** The card is ordinary HTML with a print stylesheet, and the Print button calls `window.print()`. No PDF library, no headless browser, no service. Every browser a college owns already has "Save as PDF" in its print dialogue, which is what a PDF button would have produced anyway.

The stylesheet does the work:

```css
@page { size: A4 portrait; margin: 12mm; }
@media print {
  body * { visibility: hidden; }
  .print-area, .print-area * { visibility: visible; }
  .print-area { position: absolute; inset: 0 auto auto 0; }
  .print-hide { display: none !important; }
}
```

Hiding by **visibility** rather than `display` matters. The card sits many levels deep inside the portal shell, so there is no ancestor whose siblings could simply be hidden; `visibility: hidden` on everything and `visible` on the card and its descendants works wherever in the tree the card happens to be, and does not collapse the layout on the way.

**Alternatives.**
- *Puppeteer or Playwright PDF* — a browser download and a process to manage, on a free tier, to reproduce a button the user already has.
- *A dedicated `/print` route without the portal shell* — a second layout to keep in step with the first, and a URL that renders authenticated content with no chrome.

**Consequences.** Verified against the compiled stylesheet, not the source: the built CSS carries `@page size: A4 portrait`, the visibility pair, `.print-hide { display: none !important }`, `print-color-adjust: exact` so the table grid survives, and `break-inside: avoid` on the blocks that must not straddle a page. The card is one self-contained `<article>` containing no `<nav>`, no `<aside>` and no `<button>`, and the sidebar, the back link and the Print button all sit outside it.

---

## ADR-139 · The official logo lives in `public/brand/`, byte for byte

**Status:** Accepted · 2026-08-31

**Context.** The college supplied `college logo.jpeg` in the repository root. Next.js serves static files only from `public/`, so a file at the root is unreachable by a browser — and the space in the name would have to be URL-encoded on every reference.

**Decision.** The file was **copied**, byte for byte, to `public/brand/college-logo.jpeg` — the folder the project's own `Logo` component already documents as the home for brand assets. Nothing was redrawn, recoloured, cropped, resized or regenerated; the served bytes are verified identical to the college's file.

It is rendered with a plain `<img>`, eagerly, rather than `next/image`. `next/image` lazy-loads by default, and a logo that has not finished loading when the reader presses Print is a result card with a blank space where the crest belongs. Next preloads it from the markup anyway.

**Alternatives.**
- *Reference the root file directly* — the browser cannot fetch it.
- *Move rather than copy* — removes a file the college put there.
- *`next/image`* — optimisation is worth little for a 25 KB logo, and lazy loading is a real risk on a page whose purpose is to be printed.

**Consequences.** The original at the repository root is untouched. The app shell still uses the placeholder mark; switching it over is a one-line change in `logo.tsx` whenever the college wants it, and is deliberately not part of this phase.

---

## ADR-140 · The result card is one presentational component, and it supersedes the plain result view

**Status:** Accepted · 2026-08-31

**Context.** The student result detail page already had a screen-shaped view. Adding a print-only card beside it would have meant two components rendering the same data, drifting apart, and a screen that looks nothing like the paper it produces.

**Decision.** One component, `ResultCard`, is both the on-screen preview and the printed document. It has no `'use client'`, no state and no handlers, so it renders on the server, ships no JavaScript, and can be dropped into a future admin or staff print action unchanged.

The previous `StudentResultView` was deleted rather than left unused. Its phone-friendly stacked subject list was carried into the card: below `sm` the subjects stack, from `sm` upwards — and therefore on A4, which is far wider than `sm` — they are the bordered table an examination office expects.

**Alternatives.**
- *Keep both, one screen-only and one print-only* — two definitions of the same document, and the preview stops predicting the print.
- *Card on a separate route* — the student would have to leave their result to see what will print.

**Consequences.** What is on screen is what comes out of the printer. 27 UI tests cover the card, including that no control on it matches a mutating verb, that an absence shows `Absent` with its `0.00` and its `F`, and that an INCOMPLETE result shows three dashes and never `0%`.

---

## ADR-141 · The logo prints at document scale because its blank canvas is not painted

**Status:** Accepted · 2026-08-31

**Context.** The college asked for a result-card header where the logo is one of the strongest elements — roughly 55–75mm wide on A4 — without wasting vertical space.

Measuring the supplied file explains why the first version looked small. `college logo.jpeg` is a 1280×960 canvas, but the artwork inside it — the shield, the **KABIRIAN** wordmark and the strapline — is only **572×155**, sitting dead centre:

| | |
|---|---|
| Artwork | 572 × 155 px, a 3.69 : 1 horizontal lockup |
| Share of the file | 44.7% of its width, 16.2% of its height |
| Blank margin | 27.4% left, 27.9% right, 41.9% above, 42.0% below |
| Centring | 49.7% / 49.9% — centred to within half a percent |

So **83.8% of the file's height is empty white.** Painting the whole canvas wide enough for 66mm of artwork would need a block 148mm wide and **111mm tall**, of which about 93mm is nothing at all — a third of an A4 page given over to blank space.

**Decision.** The image is rendered at the full width of a **6 : 1 box** with `object-fit: cover`, so the browser paints the middle band of the file and simply does not paint the blank margin around it.

```
w-full max-w-[148mm] aspect-[6/1] object-cover object-center
```

On A4 that is a 148mm × 24.7mm block carrying **66.1mm × 17.9mm of artwork** — 36% of the printable width, and 24.7mm of page height instead of 111mm.

**The artwork itself is never touched.** The file is byte-identical to the one the college supplied; `cover` scales proportionally, so nothing is stretched; and the painted band is the middle **38.9%–61.1%** of the image while the artwork occupies **41.9%–57.9%**, leaving **3.3mm of clear space** above and below it. Only empty canvas goes unpainted. Nothing was cropped, redrawn, recoloured or regenerated, and the original at the repository root is untouched.

The size is written in millimetres with **no breakpoint**, so the printed logo is the same 66mm whether or not the browser applies screen breakpoints to the page box — the one place where a responsive rule could have quietly shrunk the crest on paper.

**Alternatives.**
- *Save a trimmed copy of the logo* — that is cropping the file, which the college ruled out, and it would put a second version of the mark in the repository to drift from the first.
- *Render the whole canvas* — a 111mm blank block, and the crest still reading small.
- *`next/image`* — lazy by default, so a reader who presses Print quickly gets a card with a hole where the crest belongs.

**Consequences.** The header is measured, not guessed: a harness drives the copy of Edge that ships with Windows over the DevTools protocol, sets print media at the exact A4 printable area (186 × 273mm) and asserts the artwork lands between 55mm and 75mm, that `object-fit` is still `cover`, that the file is still 1280×960, and that the painted band still contains the whole artwork. If anyone later changes the box ratio far enough to bite into the mark, that check fails.

The colour beside it comes from the same file: `--color-college: #002850`, read off the logo's own navy. It is the only colour the card adds, and nothing else in the app uses it.
