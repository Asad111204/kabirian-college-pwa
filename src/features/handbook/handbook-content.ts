/**
 * What the handbook says.
 *
 * Kept apart from how it is drawn so the words can be corrected without
 * touching the layout, and so a test can read them. Everything here describes
 * what the system actually does today; if a rule changes, this changes with it.
 */

export interface HandbookRule {
  /** What the system refuses, or insists on. */
  rule: string
  /** Why it works that way. */
  because: string
}

export interface HandbookPart {
  /** Short title, as it appears in the contents. */
  title: string
  /** One line saying what this part is for. */
  summary: string
  /** The body, one paragraph per entry. */
  paragraphs: string[]
  /** Step-by-step, where there is a procedure to follow. */
  steps?: string[]
  /** The rules the system enforces here, and the reason for each. */
  rules?: HandbookRule[]
  /** Where in the app this lives. */
  where?: string
}

export const HANDBOOK_PARTS: HandbookPart[] = [
  {
    title: 'What this system is',
    summary: 'One place for the college’s records, used by the office, the teachers and the students.',
    where: 'Any browser, and installable on a phone',
    paragraphs: [
      'The Kabirian College Management System keeps the records the college runs on: who the students are, where they sit, whether they attended, what they scored, what they owe, and what the college spent. It replaces the separate registers, spreadsheets and files those things used to live in.',
      'It runs in a browser and needs nothing installed. On a phone or tablet it can be added to the home screen, after which it opens like an app, works offline for reading, and shows a count of anything unread on its icon.',
      'There are three portals, and a person sees only their own. The office sees everything it has permission for; a teacher sees their own classes; a student sees their own record. One member of staff can hold both the staff and office portals and switch between them without signing out.',
    ],
    rules: [
      {
        rule: 'Every screen checks permission on the server, not in the browser.',
        because: 'Hiding a button is not security. Somebody who types the address of a page they are not allowed is refused by the server, the same as if they had clicked.',
      },
      {
        rule: 'Nothing is ever silently deleted.',
        because: 'A record that mattered once still matters. Things are deactivated, cancelled, voided or withdrawn, each with a reason and a name against it.',
      },
    ],
  },

  {
    title: 'Signing in, and your account',
    summary: 'How people get in, and what to do when they cannot.',
    where: 'The front page, and the menu under your own name',
    paragraphs: [
      'Everybody signs in with a username and a password. A new account is created by the office with a temporary password, which is shown once and never again; the person must change it the first time they sign in.',
      'A wrong password is refused with the same message as an unknown username, so nobody can discover which accounts exist by guessing. Repeated failures lock that account for a short while, and the lock survives a restart.',
      'Under your own name in the top bar you can change your password, see every device signed in as you, and end any of them. Changing your password signs out every other device.',
    ],
    steps: [
      'Open the college’s address in a browser.',
      'Type the username and password the office gave you.',
      'Choose a password of your own when asked.',
      'On a phone, use the menu to install the app to the home screen.',
    ],
    rules: [
      {
        rule: 'A temporary password is shown once.',
        because: 'It is not stored anywhere it could be read again. If it is lost, the office issues a new one, which also signs the person out everywhere.',
      },
    ],
  },

  {
    title: 'The academic structure',
    summary: 'Sessions, classes, divisions, programmes, groups, sections, subjects and the curriculum.',
    where: 'Admin, Academic Management',
    paragraphs: [
      'Everything else hangs off this, so it is built first and changed rarely. An academic session is a year, such as 2026-27, and one of them is the current one. Within a session the college defines classes (1st Year, 2nd Year), divisions (Boys, Girls) and programmes (Pre-Medical, Pre-Engineering, ICS and so on).',
      'A class, a division and a programme together make an academic group, and a group holds one or more sections. A student is placed in a section; everything about them follows from that placement.',
      'Subjects are defined once, and the curriculum says which subjects a class studies on which programme. Adding a new programme, subject or section is ordinary office work and needs nobody technical.',
    ],
    rules: [
      {
        rule: 'A section cannot be removed while students sit in it.',
        because: 'The placement is what connects a student to their attendance, marks and results. Removing it would orphan all of it.',
      },
    ],
  },

  {
    title: 'Admitting a student',
    summary: 'One form: the student, where they sit, the year’s fee, and their documents.',
    where: 'Admin, Students, Add student',
    paragraphs: [
      'The admission form takes the student’s details, their guardian, their previous school, and the section they are joining. The student ID and admission number are generated by the system, never typed, so two people admitting at once cannot collide.',
      'The same form takes the year’s fee, head by head — tuition, annual funds, events funds, board registration, board admission, a tour and anything else the college names. Every one of them is optional: fill in what applies and leave the rest empty.',
      'It also takes the documents the family brought. Files are attached at the counter and uploaded the moment the record exists, because a file cannot belong to a student who does not exist yet. If an upload fails, the admission still stands and the screen names the file to try again from the student’s page.',
      'A portal account can be created at the same time. Its temporary password is shown once, on the screen that confirms the admission.',
    ],
    steps: [
      'Fill in the student’s details and choose their section.',
      'Enter the year’s fee under whichever heads apply.',
      'Attach the documents the family brought.',
      'Tick the box to create a portal account, if they are to have one.',
      'Save. Write down the temporary password before leaving the screen.',
    ],
  },

  {
    title: 'Attendance',
    summary: 'A register per section per subject per day, and the reports that come out of it.',
    where: 'Staff, Attendance · Admin, Attendance',
    paragraphs: [
      'A teacher opens the register for a section and subject on a date, marks each student present, absent or on leave, and submits it. Only the sections and subjects they are actually assigned to appear; the list is built from their assignments, not from anything the browser asks for.',
      'A submitted register can still be corrected by the teacher who took it, for a number of days the office sets under Settings. After that window the office corrects it. Every correction is recorded against the person who made it.',
      'The office sees today’s registers at a glance on the dashboard, and the reports give a percentage per student, per subject, per section, per class or per programme, in the college’s colour bands: below 75 red, 75 to 79 amber, 80 to 89 light green, 90 and above dark green.',
    ],
    rules: [
      {
        rule: 'A register cannot be taken for a future date.',
        because: 'A register for next Tuesday is a guess, not a record.',
      },
      {
        rule: 'A teacher can only mark their own sections.',
        because: 'The assignment is the authority. Somebody else’s class is somebody else’s record.',
      },
    ],
  },

  {
    title: 'Staff, and the staff register',
    summary: 'Staff records, what they teach, their salary, and the office’s own daily register.',
    where: 'Admin, Staff · Admin, Staff Attendance',
    paragraphs: [
      'A staff record holds the person, their designation and department, their joining date, their qualification and — for whoever may see the college’s money — their monthly salary. Teachers are then assigned to a section and a subject, and those assignments are what let them take a register or enter marks.',
      'The office keeps its own daily register for the whole staff: present, absent, short leave or leave. Short leave counts as a day at work and is shown separately so a pattern stays visible. Approved leave is left out of the worked percentage rather than counted against anybody.',
      'Each member of staff sees their own month on their own profile, read-only. A correction is asked for, not made there.',
    ],
    rules: [
      {
        rule: 'Only the office marks the staff register.',
        because: 'It is the college’s record of its own employees, not something taken by the people it is about.',
      },
    ],
  },

  {
    title: 'Exams, marks and results',
    summary: 'From creating an exam to a printed result card.',
    where: 'Admin, Exams · Staff, Exams & Marks',
    paragraphs: [
      'The office creates an exam for a session, sets its papers from the curriculum, and publishes a date sheet. Each paper for each section becomes a mark sheet, and the teacher assigned to that subject in that section enters the marks and submits them.',
      'The office can set a marks deadline on the exam: the last day a teacher may enter, correct or submit. A teacher may correct their own submitted sheet until that day passes. Afterwards the office reopens that one paper, for a stated reason, until a stated day. Published marks are never a teacher’s to change.',
      'When the marks are in, the office generates results, reviews them and publishes. A published result is a version: regenerating produces a new one rather than overwriting the old. Students and teachers read them in their own portals, and a student can print an official result card that fits one A4 page.',
    ],
    rules: [
      {
        rule: 'A teacher cannot change a published mark sheet.',
        because: 'A result card has been made from those marks. A silent correction would contradict a card a family is already holding.',
      },
      {
        rule: 'Marks are stored as whole numbers, not fractions.',
        because: 'Two screens must never round the same total differently.',
      },
    ],
  },

  {
    title: 'Timetable and homework',
    summary: 'The weekly grid, and the work teachers set.',
    where: 'Admin, Timetable · Staff, Homework · Student, Homework',
    paragraphs: [
      'The office builds the master timetable one section at a time, on a fixed nine-period grid. A clash — the same teacher or the same room in two places at once — is refused before it is written, not flagged afterwards.',
      'A teacher sees their own week and today’s lessons on their dashboard. There is no student timetable, by the college’s decision.',
      'Homework is set by the teacher assigned to that section and subject, with instructions, an optional due date and any number of attached files. The section’s students see it, soonest due first. There are no student submissions: that was not asked for.',
    ],
  },

  {
    title: 'Notices, events and complaints',
    summary: 'What the college tells people, and what they tell the college.',
    where: 'Admin, Communication · Student, Write to the Office',
    paragraphs: [
      'A notice can be addressed to everyone, to all staff, to all students, or to one class, division, programme, group or section. It can be scheduled, given an expiry, and have files attached. Nobody is told about a notice while it is still a draft.',
      'Events work the same way and carry a picture and a date. A cancelled event stays visible, marked, so nobody turns up.',
      'A student can write an application to the office: a subject, a category and what happened. The office reads it and answers, and the exchange continues until the office resolves it. Only the student who wrote it and the office can read it — not another student, and not a teacher, because a complaint may well be about a teacher. While a thread is open it refreshes itself every few seconds, so a reply appears without anybody pressing anything.',
    ],
    rules: [
      {
        rule: 'An application is never edited once sent.',
        because: 'It is what the student said, on the record. More can be added to it; what was said cannot be rewritten.',
      },
      {
        rule: 'Nothing an application says reaches the audit log.',
        because: 'The audit log is read by every administrator. The application is not.',
      },
    ],
  },

  {
    title: 'Fees',
    summary: 'An annual fee made of optional heads, paid in instalments.',
    where: 'Admin, Fees · Student, My Fees',
    paragraphs: [
      'The college charges one fee for the year, made up of named heads: tuition, annual funds, events funds, board registration, board admission, a tour and anything else. Each student’s amounts are set when they are admitted and can be changed on their record afterwards. A concession comes off the year’s total.',
      'Issuing the year’s vouchers creates one voucher per student for that session. The run always offers a dry run first, so the office can see what it would do before it does it for four hundred families. Running it twice bills nobody twice.',
      'A family pays in instalments, whenever they can. Each payment is recorded with the date, how it arrived and a slip number. A due date is optional, and a late fine only ever applies where the office set one.',
      'A voucher prints as three copies on one A4 sheet — bank, college, student — and shows what has been paid and what is left. The year’s total is deliberately not on it: a family paying in instalments needs one number at the counter.',
    ],
    steps: [
      'Set each student’s fee for the year, head by head.',
      'Open Admin, Fees and choose the year.',
      'Press Issue vouchers, then Check first.',
      'Read what it says it would do, then issue.',
      'Record each instalment as it arrives at the counter.',
    ],
    rules: [
      {
        rule: 'Every amount is a whole number of paisa.',
        because: 'Fractions of a rupee round differently in different places. Whole paisa add up exactly, every time.',
      },
      {
        rule: 'A payment is never edited, only voided with a reason.',
        because: 'A money record that can be quietly changed is a money record nobody can defend a year later.',
      },
      {
        rule: 'A voucher with money against it cannot be cancelled.',
        because: 'It would leave the payment pointing at nothing. Void the payments first, deliberately.',
      },
      {
        rule: 'What a voucher charged is frozen on it.',
        because: 'Changing next year’s fee must not rewrite what this year’s family was asked for.',
      },
    ],
  },

  {
    title: 'Finance',
    summary: 'What the college spends, against what the fees bring in.',
    where: 'Admin, Finance',
    paragraphs: [
      'Expenses are recorded under a heading — salaries, utilities, rent, maintenance, supplies, transport, events or something else — with a date, how it was paid and a bill number. Like a fee payment, an expense is never edited; one recorded in error is voided with a reason and stays on the record, struck through.',
      'The finance page puts both sides of the money on one screen: fees collected this month, money spent, what is left over, what was billed and what is still owed. Beneath it, a year drawn month by month, and a breakdown of where the month’s spending went.',
      'The same figures lead the dashboard under Payments, so the office sees them the moment it signs in.',
    ],
  },

  {
    title: 'Notifications',
    summary: 'How each portal is told that something has happened.',
    where: 'The bell in the top bar',
    paragraphs: [
      'Every portal carries a bell with what is unread behind it, a red dot on the menu button each unread thing belongs to, and a number on the home-screen icon for anybody who installed the app.',
      'People are told about the things that concern them: a notice published to the audience it was addressed to, an event, homework for their section, a date sheet, their own result, an application and its answer, and a fee voucher. Nobody is told about their own action, and nobody is told about something they could not open.',
      'Opening a page clears that part of the college; opening one notification clears just that one. Notifications arrive when the app is opened — reaching a closed phone needs a push service, which the college has not asked for.',
    ],
    rules: [
      {
        rule: 'A notification is a nudge, never a way round a permission.',
        because: 'Every link lands on a page that checks for itself, and the database refuses a link that would lead off this site.',
      },
    ],
  },

  {
    title: 'Documents',
    summary: 'Where the college’s files live, and who may open them.',
    where: 'On each student and staff record',
    paragraphs: [
      'The college defines the documents it asks for and which of them are required. Files are stored in the college’s own Google Drive, and the database keeps the record of what exists: who it belongs to, what it is, who uploaded it and when. Losing the Drive account would lose the files but never the record of what existed.',
      'A photograph doubles as the profile picture, and a small thumbnail of it is kept in the database so faces appear beside names quickly.',
      'Documents marked sensitive are shown to fewer people. Nobody sees a file by guessing its address: every download is checked against who is asking.',
    ],
  },

  {
    title: 'Reports and printing',
    summary: 'Lists you can hand to somebody, on screen, on paper or as a file.',
    where: 'Admin, Reports',
    paragraphs: [
      'The report centre covers students, staff, missing documents, exam mark sheets and results, filtered and grouped by class, division, programme or section. What the screen shows is what prints, and what downloads as a spreadsheet file — the same query, three ways out.',
      'Result cards and fee vouchers print as documents rather than screenshots, and the browser’s own Save as PDF turns either into a file. This handbook prints the same way.',
    ],
  },

  {
    title: 'Who may do what',
    summary: 'Roles, permissions, and the account that holds two portals.',
    where: 'Admin, User Accounts',
    paragraphs: [
      'Every account is an administrator, a member of staff or a student, and each role carries a set of permissions by default. An individual permission can be granted or taken away from one person without changing anybody else.',
      'A member of staff can additionally be given office access. They keep one account and one password, and a switcher appears in their menu. Whichever portal they are working in is what they are: a principal in the staff portal is a teacher, with a teacher’s scope, and the same person in the office portal is the office.',
      'Taking office access away needs nobody to remember anything: a session sitting in the office portal falls back to the staff portal on the next click, without signing that person out of what they were doing.',
    ],
    rules: [
      {
        rule: 'Nobody changes their own office access, or erases their own account.',
        because: 'Both are ways a person could lock the college out or promote themselves. Another administrator does it.',
      },
      {
        rule: 'The last active administrator cannot be deactivated or erased.',
        because: 'It would leave nobody able to get in.',
      },
    ],
  },

  {
    title: 'The audit log',
    summary: 'What was done, by whom, and when.',
    where: 'Admin, Audit Log',
    paragraphs: [
      'Every change of consequence is recorded: who acted, what they acted on, when, and from which address. Entries can be filtered by person, by module, by action and by date, and exported.',
      'What an entry shows is deliberately limited. Passwords, tokens, CNICs, B-Form numbers, document identifiers and the contents of a complaint never appear in it. An entry shows that something changed and which fields, not the secrets inside them.',
    ],
    rules: [
      {
        rule: 'An account that has ever acted cannot be erased.',
        because: 'The log names who acted by that account alone. Erasing it would leave a trail of entries saying nobody did anything.',
      },
    ],
  },

  {
    title: 'Erasing a record',
    summary: 'The one way something leaves the system for good.',
    where: 'On a student, staff or account page, under Erase permanently',
    paragraphs: [
      'A student, a member of staff or an account can be permanently erased only when nothing at all refers to it. The system counts the references and either allows it or explains, by name and number, what stands in the way — and says to deactivate instead.',
      'Nothing cascades. Attendance, marks, results, documents, applications and fee vouchers each hold a student in place; registers, mark sheets, homework, staff attendance, documents and timetable lessons each hold a member of staff. Only a record’s own placement goes with it.',
      'The confirmation is the record’s own code, not the word "delete", so it cannot be typed without looking at which record is open.',
    ],
    rules: [
      {
        rule: 'In practice, only a record created by mistake and never used can be erased.',
        because: 'That is the honest answer. Deactivation is the right tool for everything else, and it keeps the history.',
      },
    ],
  },

  {
    title: 'Keeping it safe',
    summary: 'Backups, restores, and the few things worth doing regularly.',
    where: 'Run by whoever administers the system',
    paragraphs: [
      'A backup exports the whole database to a file. A restore has been rehearsed end to end — backed up, damaged deliberately, restored, and checked — so it is a procedure rather than a hope. Keep a copy somewhere that is not the same machine.',
      'The database is hosted by Neon and the application by Vercel, both on their free tiers. Files are in the college’s own Google Drive. If the Drive connection is ever lost, reconnect it from Admin, Settings; the record of every document survives regardless.',
      'Every change to the database is applied as a numbered migration, and the live database is checked for drift afterwards. Nothing is changed by hand.',
    ],
    steps: [
      'Take a backup before anything unusual — a bulk import, an end of session, an upgrade.',
      'Keep the file off the machine that made it.',
      'Check Admin, Settings after any change to the Google account.',
      'Read the audit log if something looks wrong; it will say who did what.',
    ],
  },
]

/** What the cover says under the title. */
export const HANDBOOK_SUBTITLE = 'A complete guide to the college management system: what it does, who may do it, and the rules it keeps.'
