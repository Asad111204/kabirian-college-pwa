# Handover — running the system day to day

For the Nova School Kamalia administrator. `docs/DEPLOYMENT.md` covers the hosting; this covers the people and the data.

## Accounts and passwords

- There is no sign-up. Every account is created by an administrator under **User Accounts → Create account**, which shows a temporary password **once**. Hand it over in person; the person is made to choose their own password at first sign-in.
- Roles: **Admin** (the office), **Staff** (teachers and other staff, linked to a staff record), **Student** (linked to a student record). Permissions come with the role; a single account can be given or refused an extra permission under its page → **Permissions** (for example a clerk who may generate reports but not manage accounts).
- The first administrator is the **system owner** and cannot be deactivated or demoted, so the school can never lock itself out.
- A forgotten password: open the account → **Reset password** → a new temporary password, shown once. Nothing is ever emailed.
- A lost or shared phone: the person (or an administrator on their page) → **Signed-in devices** → sign that device out. Changing the password signs out every device.
- Ten wrong passwords lock an account for fifteen minutes; an administrator can unlock it on the account's page.

## The academic year

1. **Academics → Sessions**: create the new session and make it current when the year begins.
2. **Academics → Session Structure**: tick the class × division × programme combinations that exist this year (or **Copy structure from previous session**) and add sections.
3. **Academics → Curriculum**: subjects per class and programme (copied with the structure).
4. **Staff → each teacher → Assignments**: who teaches which subject in which section. This is what decides what a teacher can see and mark — a teacher with no assignment sees nothing.
5. **Timetable**: periods per section; teachers see their own week and today's lessons.
6. Promote students at the end of the year from the student's page (**Promote**), which closes the old enrolment and opens the next.

## Importing students

For a new intake, prepare a spreadsheet and save it as CSV with these columns (header row; order does not matter): `full_name, father_name, class, division, program, section` and optionally `roll_number, admission_number, admission_date, gender, date_of_birth, phone, email, address, city, cnic_bform, father_cnic, father_phone, father_occupation, mother_name, guardian_name, guardian_relation, guardian_phone, previous_institution, previous_result, previous_obtained, previous_total, matric_roll, matric_board, notes`. Class, division, programme and section must match the names in the current session's structure ("1st Year", "Girls", "Pre-Medical", "A").

```
npm run import:students -- --file intake.csv --url https://<your-domain>            # checks only
npm run import:students -- --file intake.csv --url https://<your-domain> --apply    # creates
```

The first run only reports problems (a section that does not exist, a CNIC in the wrong format, a duplicate admission number); fix the sheet and run again. With `--apply`, each row goes through exactly the same path as the admission form, appears in the audit log under your account, and gets its student ID from the system. Portal logins for students are created afterwards, one by one or as needed, from the student's page.

## Every day

| Who | What | Where |
|---|---|---|
| Teacher | Mark attendance for a lesson | Attendance → today's register; submit when done. Corrections after submission go through the office. |
| Office | See today's coverage, absentees, missing registers | Admin → Attendance, and the dashboard |
| Office | Exams: create the exam and its papers, publish the date sheet, open mark sheets | Exams |
| Teacher | Enter marks, submit | Exams & Marks |
| Office | Generate and publish results | Exam → Results. Students see results only once published. |
| Office | Notices and events | Notices / Events — choose who it is for; publish when ready |
| Anyone | Reports and CSV | Admin → Reports; attendance reports have their own page |
| Office | Who changed what | Admin → Audit Log |

## Documents

Photos, CNIC/B-Form scans, result cards and certificates are uploaded from the student's or staff member's page and stored in the school's Google Drive. **Settings → Document types** decides which are required and their size limits; the missing-documents report lists who still owes what.

## When something goes wrong

- **"Cannot reach the server"** on a phone: the app is offline — the banner says so. Nothing typed is lost until the page is left; submit once the connection is back.
- **A page says "Something went wrong"** with a reference: try again; if it persists, note the reference and the time and check the host's logs (`docs/DEPLOYMENT.md` § Monitoring).
- **Google Drive stopped working**: Settings → Google Drive shows the connection; press **Test connection**; if it asks, reconnect with the school's Google account.
- **A record was changed by mistake**: the audit log shows what it was; most things can be edited back. A whole-database mistake is what Neon's history and the weekly backup are for (`docs/DEPLOYMENT.md` § Backups).
- **Someone left the school**: deactivate the account (it keeps its history); mark the student's or staff member's status; do not delete.

## What the system does not do (yet)

Fees, homework, complaints, staff attendance, profile photos in lists, a marks-correction window for teachers, multi-role accounts and the finance module are planned next (PROJECT_PLAN.md § 23A). Nothing in the screens pretends otherwise.
