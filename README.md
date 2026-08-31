# Kabirian College Management System

A Progressive Web App for running Kabirian College: students, staff, academics, attendance, exams, results, timetables, notices, documents and reports — with three portals (**Admin**, **Staff**, **Student**) sharing one database and one permission system.

> **Current status: Phase 8 complete.** Working today: project setup, design system, database, authentication, roles, **Academic Management**, **User & Account Management**, the **Admin Dashboard**, **Student Management**, **Staff Management with the Staff Portal**, **document storage in Google Drive**, and **Attendance** for all three portals with reports. **Exams & Marks**: an administrator creates exams, sets their papers from the curriculum and publishes a date sheet; teachers enter and submit marks for the papers they teach; the office generates, reviews and publishes results; students and teachers read them in their own portals, and a student can print an official result card that fits one A4 page. Exports and notifications are next — see [PROJECT_PLAN.md](PROJECT_PLAN.md).

---

## What you need before you start

| | | Cost |
|---|---|---|
| **Node.js 20.11 or newer** | [nodejs.org](https://nodejs.org) — check with `node --version` | Free |
| **A PostgreSQL database** | Easiest: a free [Neon](https://neon.com) account (nothing to install). Or install [PostgreSQL](https://www.postgresql.org/download/windows/) locally. | Free |
| **Git** *(optional)* | For version control | Free |

Everything in this project is free and open source. Nothing requires a paid service to develop or to run a first deployment.

---

## Setup — five steps

### 1. Install the dependencies

```bash
npm install
```

If npm says some packages have install scripts that were not run, approve them once (this is npm's security feature — the four packages below need to download their native binaries):

```bash
npm approve-scripts prisma @prisma/engines esbuild unrs-resolver sharp
```

### 2. Create your settings file

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Git Bash / macOS / Linux
cp .env.example .env
```

Then open `.env` and fill in the values below.

**`DATABASE_URL`** — your database connection string.

*Using Neon (recommended, no installation):*
1. Sign up at [neon.com](https://neon.com) and create a project.
2. Copy the connection string it shows you.
3. Paste it in, using `sslmode=verify-full` so the certificate is actually checked:
   ```
   DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/kabirian?sslmode=verify-full&channel_binding=require"
   ```

*Using a local PostgreSQL:*
```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/kabirian_college"
```

**`DATABASE_DIRECT_URL`** — optional, and only used by `prisma migrate`.

If your `DATABASE_URL` goes through a connection pooler, set this to the **direct** connection as well. A pooler will close the connection partway through a long migration and leave it half-applied — tables created, but foreign keys and constraints missing — which is far worse than a clean failure. The app itself keeps using the pooled connection.

On Neon, the direct host is the pooled one with `-pooler` removed:

```
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/kabirian?sslmode=verify-full"
DATABASE_DIRECT_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/kabirian?sslmode=verify-full"
```

Leave it blank if your `DATABASE_URL` is already a direct connection.

**`APP_ENCRYPTION_KEY`** — a random key used to encrypt secrets stored in the database (needed from Phase 6). Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Check the connection before going further:

```bash
npm run check:db
```

### 3. Create the database tables

```bash
npm run db:migrate
```

### 4. Load the starting data

```bash
npm run seed:reference    # permissions, classes, divisions, programs, subjects,
                          # designations and departments
npm run seed:structure    # the academic session and its 20 groups
```

This creates Kabirian College's current structure:

```
2026-27
├── 1st Year / 11th Class          └── 2nd Year / 12th Class
│   ├── Boys                            ├── Boys
│   │   ├── Pre-Medical → Section A     │   └── (same five programs)
│   │   ├── Pre-Engineering → A         └── Girls
│   │   ├── ICS Physics → A                 └── (same five programs)
│   │   ├── ICS Economics → A
│   │   └── FAIT → A
│   └── Girls (same five programs)
```

**This is starting data, not fixed logic.** Every class, division, program, section and subject can be added, renamed or deactivated from the Admin portal without touching any code.

### 5. Create your administrator account

```bash
npm run create-admin
```

It prints a username and a one-time password — **write them down**, they cannot be shown again. You will be asked to choose your own password when you first sign in.

To use a different username: `npm run create-admin -- --username principal`

---

## Running the app

```bash
npm run dev
```

Open **http://localhost:3000** and sign in with the account you just created.

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server (auto-reloads as you edit) |
| `npm run build` | Build the production version |
| `npm start` | Run the production build |
| `npm test` | Run the tests |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run check:db` | Test the database connection and show what is in it |
| `npm run db:studio` | Open a visual database browser |
| `npm run db:migrate` | Apply database migrations |
| `npm run seed:dev` | Add fake demo students/teacher for testing (never in production) |
| `npm run create-admin` | Create an administrator account |

---

## What works today

### Sign in and accounts
- Username + password sign-in, with the password stored only as an Argon2id hash.
- Sessions in an HttpOnly cookie; deactivating an account signs it out everywhere immediately.
- Repeated wrong passwords are rate-limited, then the account locks for 15 minutes.
- Temporary passwords must be changed at first sign-in.

### Admin Dashboard

The landing page after signing in as an administrator. Everything on it is read from the database on each visit.

- **Attention banners** — tells you if there is no current session, no structure for it, or no curriculum yet, each with a link to fix it.
- **Overview** — user accounts, students, staff and sections at a glance.
- **Academic statistics** — classes, divisions, programs, subjects and academic groups.
- **Academic structure** — this year's structure, nested Class → Division → Program with its sections. Add a program such as "I.Com" and it appears here straight away.
- **Quick actions** — shortcuts to the screens *you* are allowed to use.
- **Recent activity** — the last administrative changes, in plain sentences.
- **Not built yet** — the modules still to come, with their phase number.

**Numbers you can trust.** Attendance, exams, results, documents and notices show no figures at all, because those modules do not exist yet — a "0" would read as real information. They are listed under "Not built yet" instead. Where a zero *is* real (you have no students yet), it is shown with an explanation rather than a broken-looking card.

### Three portals
- **Admin** — dashboard, Academic Management, Students, Staff and User Accounts.
- **Staff** — dashboard, their own assignments, and the students in their own sections.
- **Student** — dashboard showing that student's own class, program, section and roll number.

A student who types `/admin` in the address bar is sent back to their own portal. This is checked on the server, so it cannot be bypassed.

### User & Account Management (Admin portal)

**Admin → User Accounts** lets you run every sign-in account for the college.

| What you can do | How it behaves |
|---|---|
| **Create an account** | Choose the role (Administrator, Staff, Student). A secure temporary password is generated and shown **once** — write it down. The person must choose their own password the first time they sign in. |
| **Find people** | Search by name or username, filter by role and status (including *Locked*), sort the columns, and page through the list. Only one page is ever sent to the browser. |
| **Reset a password** | Issues a new temporary password and signs the person out on every device. |
| **Deactivate / activate** | Deactivating blocks sign-in immediately and ends every session. Nothing is deleted. |
| **Unlock** | Clears the 15-minute lock that follows too many wrong passwords. |
| **Sign out everywhere** | Ends all their sessions without changing the password — useful if a phone is lost. |
| **Change role** | Requires typing the username to confirm. Clears their individual permissions and signs them out, so the new role takes effect cleanly. |
| **Permissions** | Per-person exceptions: **Default** (follow the role), **Allow**, or **Deny**. The screen always shows the role default, the exception and the resulting effective permission side by side. |

**Accounts are never deleted.** Attendance, marks and audit records refer to them, so a person who leaves is deactivated instead — they can no longer sign in, and every historical record stays intact.

**You cannot lock yourself out.** The system refuses to let you deactivate your own account, change your own role, or remove your own user-management permission; it also protects the last remaining administrator and the original owner account. Where an action is blocked, the button is disabled and says why.

### Student Management (Admin portal)

**Admin → Students** is where the college's student records live.

| What you can do | How it behaves |
|---|---|
| **Admit a student** | One form: admission details, personal information, parent/guardian, previous education, and where they will sit. The **Student ID** (`STU-0001`) and **admission number** (`ADM-00001`) are generated by the system — you never type them. |
| **Place them** | Choose Session → Class → Division → Program → Section. Each dropdown only offers combinations that actually exist, so an impossible placement cannot be selected. |
| **Give them a login** | Tick "Create a student portal account" while admitting, or add one later from their profile. A temporary password is shown **once**. |
| **Find a student** | Search by name, student ID, admission number or roll number; filter by session, class, division, program, section and status. |
| **Transfer** | Move to a different section, program or division **within the same year**. |
| **Promote** | Move into the **next academic year** — always a deliberate action, never automatic. |
| **Change status** | Active, Inactive, Left/Withdrawn, Graduated, Transferred out. |

**Nothing is ever overwritten.** A transfer or promotion closes the old enrollment and opens a new one, so the student's profile shows their complete year-by-year history. A student who leaves keeps every record; there is no delete.

**Roll numbers** are unique within a section. If a student leaves that section, their roll number becomes available again.

**Subjects** on a profile come from the curriculum for their class and program — so they are always right, and change for everyone at once when you edit the curriculum.

### Staff Management (Admin portal)

**Admin → Staff** holds the college's teachers and other staff.

| What you can do | How it behaves |
|---|---|
| **Add a staff member** | Employment, personal and contact details. The **Staff ID** (`STF-0001`) is generated for you. Optionally create their portal login at the same time. |
| **Designation & department** | Chosen from managed lists (Academic Management → Designations / Departments). Add "Senior Lecturer" there and it is selectable straight away. |
| **Assign a subject** | Session → Class → Division → Program → Section → Subject. Only combinations that exist are offered, and only subjects in that program's curriculum. |
| **Section in-charge** | Make someone responsible for a whole section. A section has one in-charge at a time; replacing them keeps the previous appointment on record. |
| **Change employment status** | Active, On leave, Inactive, Resigned, Retired, Terminated. |

**Ending employment ends access.** Marking someone Resigned (or Retired, Terminated, Inactive) closes their assignments and in-charge roles, which immediately removes their access to student information. Every record is kept as history.

**Only teaching staff can be assigned subjects** — an administrative or support staff member is refused, with a message saying why.

### Documents (Admin portal)

Every student and staff profile has a **Documents** panel listing what the college collects, whether each item is on file, and what is still missing.

| Student | Staff |
|---|---|
| Photograph *(required)* | Photograph *(required)* |
| CNIC / B-Form *(required)* | CNIC *(required)* |
| Father's CNIC *(required)* | CV / Résumé |
| Matric result card *(required)* | |
| Matric roll number slip | |

This list lives in the `document_types` table, so adding "Domicile Certificate" — with its own size limit and allowed file types — is data entry, not a code change.

**Uploading** replaces rather than overwrites. The previous file becomes history: the row is kept and marked *replaced*, and you can still open it from the panel. The old file goes to the Google Drive trash, where it stays recoverable for 30 days.

**Every file is checked before it is stored.** The size is checked against that document type's own limit (2 MB for a photograph, 10 MB for a scan), and the file's actual contents are inspected — not the name or what the browser claimed. An HTML file renamed `photo.jpg` is refused.

**Who can see what**

| | Photograph | CNIC, B-Form, results |
|---|---|---|
| Administrator | ✅ | ✅ |
| Teacher, for a student in their own sections | ✅ | ❌ |
| Teacher, any other student | ❌ | ❌ |
| The student or staff member themselves | ✅ | ✅ |

A class teacher needs the photograph for their register; they do not need the family's identity documents. If the college wants a particular clerk to handle documents, grant them the **View sensitive identity documents** permission in User Accounts — no code change.

Only administrators can upload, replace or delete. Students and teachers can look, not change.

**Documents are never public.** No file is shared in Google Drive, and no Drive link is ever shown. Files are streamed through the app, which checks who is asking on every single request — so a URL copied out of the address bar does not work for anyone else.

### Staff Portal

A teacher signs in and sees only their own work:

- **Dashboard** — their assignments, sections, subjects and student count.
- **My Assignments** — grouped by academic year, showing where they are also section in-charge.
- **My Students** — the students in their own sections.
- **My Profile** — their own record.

**What a teacher can see is decided on the server.** They reach a section only if they teach a subject in it or are its in-charge. Asking for any other section is refused. And the student information they receive is deliberately limited: **name, father's name, roll number and class placement** — never CNICs, addresses, phone numbers or guardian details. Those stay with the college office.

### Linking accounts to staff and student records

A staff or student account can be linked to their personnel record, so the system knows that this login belongs to that teacher or that student. Records are created in Phases 4 and 5 — until then you can create accounts on their own and link them later.

### Academic Management (Admin portal)

| Screen | What you can do |
|---|---|
| **Academic Sessions** | Add, edit, delete; choose which session is *current* |
| **Classes / Years** | Add, edit, activate/deactivate; set name, display name, code and level |
| **Divisions** | Add, edit, activate/deactivate (Boys, Girls, or anything else) |
| **Programs** | Add, edit, activate/deactivate — **add I.Com or any new program at any time** |
| **Session Structure** | A matrix per class: tick a Division × Program box to create it; manage its sections (A, B, C…) |
| **Subjects** | The master subject list |
| **Curriculum** | Choose which subjects each Class × Program studies — different programs, different subjects |

### Adding a new program (no developer needed)

1. **Academic Management → Programs → Add program**
2. Enter e.g. Name `I.Com`, Code `ICOM`, Description `Intermediate in Commerce`
3. **Create program**

It appears in the list straight away and can immediately be used on the Session Structure screen, in the curriculum, and (in later phases) for enrolments, teacher assignments, timetables, exams and results.

### Protecting your records

Academic records are never casually destroyed:

- Deleting a program, class, division, section or subject **that is already in use is refused**, with a message explaining what is using it.
- **Deactivate** it instead — it disappears from new entries while every existing student record, enrolment and result stays exactly as it was.
- Every change is written to the audit log with who did it, when, and the before/after values.

---

---

## Connecting Google Drive

Documents are stored in a Google Drive account belonging to the college. The database keeps the record of every document; Drive keeps the file itself. **Drive is never used as the database.**

You only do this once.

### What you need

- A Google account for the college. Whichever account you connect **owns the files**, so use a college account rather than a personal one — a departing staff member should not leave with the college's records.
- A Google Cloud project with the **Google Drive API** enabled and an **OAuth 2.0 Client ID** of type *Web application*.

### 1. Add the redirect URI in Google Cloud

In your OAuth client, add this **Authorised redirect URI**, character for character:

```
http://localhost:3000/api/v1/settings/google/callback
```

When you deploy, add your real address too (for example `https://college.example.com/api/v1/settings/google/callback`) and change `GOOGLE_OAUTH_REDIRECT_URI` in `.env` to match. A mismatch here is the single most common cause of `redirect_uri_mismatch`.

### 2. Put the credentials in `.env`

```env
STORAGE_PROVIDER=google_drive
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/settings/google/callback
```

You also need `APP_ENCRYPTION_KEY`, which encrypts the Google token before it is stored:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Restart the app after changing `.env`.

**Never** commit these values, put them in `.env.example`, or prefix them with `NEXT_PUBLIC_`. They are server-only, and nothing in this app ever sends them to a browser.

### 3. Connect

Sign in as an administrator, go to **Settings**, and click **Connect Google Drive**. Google shows its own sign-in page — this application never sees your Google password.

Approve the request, and you are returned to Settings showing the connected account. The app creates its folders on the spot:

```
Kabirian College/
  Students/
    STU-0001 Ali Raza/
  Staff/
    STF-0001 Sara Khan/
```

**Test connection** asks Google directly and reports the account and how much Drive storage is left. It is a real call, not a stored flag — if the token has stopped working, this is where you find out.

### What the app can and cannot see

The app requests one permission: `drive.file`. That grants access **only to files this application creates**. It cannot read anything else in that Google account — not your email, not your other documents. This is deliberate, and it is also why the broad "see all your Drive files" permission is never requested.

### Two things to know about "Testing" mode

While your OAuth app's publishing status is **Testing** in Google Cloud:

- Only accounts listed as **test users** can connect.
- **Google expires the connection after seven days.** When that happens uploads stop with *"Google has ended the Drive authorisation for this app"*, and an administrator just clicks **Reconnect** in Settings.

To stop the seven-day expiry, set the publishing status to **In production**. Because `drive.file` is a non-sensitive scope, this does not normally require Google's verification review.

### Storage cost

A Google account includes 15 GB free, shared with Gmail and Photos. At roughly 1 MB per document and five documents per student, 3,000 students is about 15 GB — so a college of that size will eventually need Google Workspace or extra storage. Nothing else in this system costs money. The **Test connection** button shows how much space is left, so you will see it coming.

### Disconnecting

**Disconnect** in Settings makes the app forget its Google token. Nothing is deleted: every file stays in Drive and every document record stays in the database. Uploading and viewing stop working until you connect again.

---

## Not built yet (and honestly so)

These are planned for later phases and are **not** silently faked anywhere in the app:

| Feature | Phase |
|---|---|
| Attendance | 7 |
| Exams and marks | 8 |
| Results | 9 |
| Timetable | 10 |
| Notices and events | 11 |
| Reports and exports | 13 |
| Audit log viewer | 14 |
| Offline service worker | 15 |

The database schema for students, staff, enrolments and teacher assignments **already exists** so that the academic structure's safety rules are real and tested. File storage goes through one interface (`src/server/storage/provider.ts`); when `STORAGE_PROVIDER=none` every upload fails with a clear message rather than pretending to store a file.

The app is already installable as a PWA (manifest + icons). Offline caching comes in Phase 15; today the app needs a network connection, and it says so rather than pretending otherwise.

---

## Project layout

```
prisma/
  schema.prisma          the database design
  migrations/            versioned SQL changes
  seed/                  reference.ts · structure.ts · dev.ts
src/
  app/                   pages and API routes (thin — they call services)
    (portal)/admin|staff|student
    api/v1/…
  components/ui/         buttons, inputs, tables, dialogs, alerts…
  components/layout/     app shell, sidebar, logo
  features/academics/    the academic management screens
  server/                SERVER ONLY — never imported by the browser
    auth/                passwords, sessions, permissions
    services/            all business rules and all authorization
    attendance/          the attendance rules, as pure functions
    exams/               the result and scheduling rules, as pure functions
    storage/             file storage interface (Google Drive in Phase 6)
    audit/  db/  config/ api/
  validation/            Zod schemas shared by browser and server
  lib/                   small shared helpers
tests/unit/              tests
scripts/                 create-admin.ts · check-db.ts · generate-icons.ts
```

**The rule that matters:** all business logic and every permission check lives in `src/server/services`. Pages and API routes are thin wrappers. That way a new screen can never accidentally skip a security check.

---

## Environment variables

All settings live in `.env`, which is **never committed to Git**. See [.env.example](.env.example) for the full list with explanations. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `APP_ENCRYPTION_KEY` | Encrypts secrets stored in the database |
| `APP_COLLEGE_NAME` | Name shown throughout the app |
| `APP_TIMEZONE` | `Asia/Karachi` — used for all date calculations |
| `SESSION_MAX_AGE_DAYS` | How long a sign-in lasts |
| `DATABASE_POOL_MAX` | Simultaneous database connections (keep small on free tiers) |
| `STORAGE_PROVIDER` | `none` refuses uploads; `google_drive` enables documents |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Your Google OAuth client — see below |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must match the Google Cloud console **exactly** |
| `UPLOAD_MAX_SIZE_MB` | Hard ceiling for any upload; each document type has its own smaller limit |
| `DOCUMENT_REPLACE_POLICY` | `trash` (recoverable for 30 days) or `keep` |

---

## Testing

```bash
npm test          # unit tests
npm run lint      # code style
npm run typecheck # types
```

There are **788 tests** covering the password policy, the permission model, academic validation, record-safety logic, user-account validation, the lock-out safeguards, the dashboard statistics, student enrollment, staff assignments, document access rules, file-type validation, secret encryption, the attendance rules and screens, the exam schema and result calculation, the exam scheduling rules, the marks workflow, result calculation, ranking and publication, the student and staff result portals, and the **official result card**. The schema tests apply every migration to a throwaway PostgreSQL and check what the database itself refuses. Integration tests against a test database and browser tests (Playwright) are added in Phase 16.

---

## Deployment

Not done yet — Phase 17. The app is designed to run as a normal Node server, so it can be deployed to any of these for free or nearly free:

- **Railway / Render / Fly.io** — free or low-cost tiers, plus a free Neon database.
- **A small VPS** — full control, a few dollars a month.

Vercel also works, but its free tier limits uploads to 4.5 MB per request, which matters once document uploads arrive in Phase 6.

---

## Troubleshooting

**`DATABASE_URL is not set`** — you have not created `.env` yet. Copy `.env.example` to `.env`.

**Cannot connect to the database** — run `npm run check:db` for a detailed diagnosis. Usually the password is wrong, or a hosted database needs the SSL setting at the end of the URL.

**"Server has closed the connection" on the first try, then it works** — Neon's free tier puts the database to sleep when it is idle. The first request wakes it and can take 5–10 seconds or fail once. Simply run the command again. A paid Neon plan keeps it awake.

**Deprecation warning about `sslmode`** — use `sslmode=verify-full` instead of `sslmode=require` in your `DATABASE_URL`. It silences the warning *and* actually verifies the database's certificate, which `require` alone does not.

**`npm install` warns about install scripts** — run the `npm approve-scripts` command in step 1.

**Forgot the admin password** — run `npm run create-admin -- --username admin2` to make a second administrator.

---

## Documentation

| File | Contents |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Requirements, architecture, roadmap, current progress |
| [DECISIONS.md](DECISIONS.md) | Every architectural decision and why it was made |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | The full database design |
