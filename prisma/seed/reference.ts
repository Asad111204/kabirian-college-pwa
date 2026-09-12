/**
 * Reference seed — SAFE TO RUN IN PRODUCTION.
 *
 * It inserts the data the system needs in order to work at all:
 *   - the permission catalogue and each role's defaults,
 *   - Nova School Kamalia's classes (PG to 10), a starting division and program,
 *   - a starting list of subjects,
 *   - a starting grading scale,
 *   - system settings and the STU-/STF- code counters.
 *
 * Everything here is EDITABLE afterwards from the Admin portal. These are
 * starting values, not application logic — the code never refers to
 * "General" or "Class 1" by name.
 *
 * The script is idempotent: running it twice changes nothing the second time,
 * and it never overwrites a record the admin has since edited.
 *
 *   npm run seed:reference
 */
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../../src/server/auth/permissions'
import { done, heading, prisma } from './seed-utils'

/* --------------------------------------------------------------------------
 * Nova School Kamalia's structure. Change any of it later in
 * Admin -> Academic Management.
 *
 * `level` is the promotion order: a student in level 5 (Class 1) is promoted
 * into level 6 (Class 2). `displayName` is what reports and result cards
 * print; when it is null the short name is used everywhere.
 * ----------------------------------------------------------------------- */

const CLASSES = [
  { name: 'PG', displayName: null, code: 'PG', level: 1 },
  { name: 'Pre-Nursery', displayName: null, code: 'PRE-NUR', level: 2 },
  { name: 'Nursery', displayName: null, code: 'NUR', level: 3 },
  { name: 'KG', displayName: null, code: 'KG', level: 4 },
  { name: '1', displayName: 'Class 1', code: '1', level: 5 },
  { name: '2', displayName: 'Class 2', code: '2', level: 6 },
  { name: '3', displayName: 'Class 3', code: '3', level: 7 },
  { name: '4', displayName: 'Class 4', code: '4', level: 8 },
  { name: '5', displayName: 'Class 5', code: '5', level: 9 },
  { name: '6', displayName: 'Class 6', code: '6', level: 10 },
  { name: '7', displayName: 'Class 7', code: '7', level: 11 },
  { name: '8', displayName: 'Class 8', code: '8', level: 12 },
  { name: '9', displayName: 'Class 9', code: '9', level: 13 },
  { name: '10', displayName: 'Class 10', code: '10', level: 14 },
]

/**
 * The application requires every academic group to have a division and a
 * program (Session x Class x Division x Program -> Section). A school does not
 * split its classes into streams the way a college does, so one neutral entry
 * of each is seeded. If the school separates Boys and Girls, or runs Science
 * and Arts groups in classes 9-10, add those rows in Admin -> Academic
 * Management; nothing in the code depends on these names.
 */
const DIVISIONS = [{ name: 'General', code: 'GEN', sortOrder: 1 }]

const PROGRAMS = [
  { name: 'General', code: 'GEN', description: 'The standard school programme for every class', sortOrder: 1 },
]

/**
 * A starting subject list. The admin will correct it and then decide, on the
 * Curriculum screen, which program studies which of these.
 */
const SUBJECTS = [
  { name: 'English', code: 'ENG' },
  { name: 'Urdu', code: 'URD' },
  { name: 'Mathematics', code: 'MATH' },
  { name: 'Science', code: 'SCI' },
  { name: 'Islamiat', code: 'ISL' },
  { name: 'Pakistan Studies', code: 'PST' },
  { name: 'Social Studies', code: 'SST' },
  { name: 'General Knowledge', code: 'GK' },
  { name: 'Computer', code: 'COMP' },
  { name: 'Nazra Quran', code: 'QRN' },
  { name: 'Drawing', code: 'ART' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Chemistry', code: 'CHEM' },
  { name: 'Biology', code: 'BIO' },
]

/**
 * Job titles used across Pakistani schools. Reference data, not fixed logic —
 * the Admin adds to this list from Academic Management.
 */
const DESIGNATIONS = [
  { name: 'Principal', code: 'PRIN', isTeaching: true, sortOrder: 1 },
  { name: 'Vice Principal', code: 'VPRIN', isTeaching: true, sortOrder: 2 },
  { name: 'Academic Coordinator', code: 'COORD', isTeaching: true, sortOrder: 3 },
  { name: 'Senior Teacher', code: 'SR-TEACH', isTeaching: true, sortOrder: 4 },
  { name: 'Teacher', code: 'TEACH', isTeaching: true, sortOrder: 5 },
  { name: 'Junior Teacher', code: 'JR-TEACH', isTeaching: true, sortOrder: 6 },
  { name: 'Montessori Teacher', code: 'MONT', isTeaching: true, sortOrder: 7 },
  { name: 'Lab Assistant', code: 'LAB-ASST', isTeaching: false, sortOrder: 8 },
  { name: 'Librarian', code: 'LIB', isTeaching: false, sortOrder: 9 },
  { name: 'Office Superintendent', code: 'OFF-SUP', isTeaching: false, sortOrder: 10 },
  { name: 'Clerk', code: 'CLERK', isTeaching: false, sortOrder: 11 },
  { name: 'Accountant', code: 'ACCT', isTeaching: false, sortOrder: 12 },
]

/** Departments a staff member can belong to. Also editable by Admin. */
const DEPARTMENTS = [
  { name: 'Pre-Primary', code: 'PRE-PRI', sortOrder: 1 },
  { name: 'English', code: 'ENG', sortOrder: 2 },
  { name: 'Urdu', code: 'URD', sortOrder: 3 },
  { name: 'Mathematics', code: 'MATH', sortOrder: 4 },
  { name: 'Science', code: 'SCI', sortOrder: 5 },
  { name: 'Computer', code: 'COMP', sortOrder: 6 },
  { name: 'Islamic Studies', code: 'ISL', sortOrder: 7 },
  { name: 'Social Studies', code: 'SST', sortOrder: 8 },
  { name: 'Administration', code: 'ADMIN', sortOrder: 9 },
]


/**
 * The document checklist the school starts with.
 *
 * These are ordinary rows: the Admin can add "Domicile Certificate", change a
 * size limit, or switch a type off without any code change.
 *
 * `isSensitive` decides who may open the file. A photograph is not sensitive —
 * a class teacher needs it for their register. An identity document is, so it
 * needs the `documents.view_sensitive` permission, which only administrators
 * hold by default.
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const SCAN_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MB = 1024 * 1024

const DOCUMENT_TYPES = [
  {
    key: 'STUDENT_PHOTO',
    label: 'Photograph',
    ownerType: 'STUDENT',
    isRequired: true,
    isSensitive: false,
    allowedMimeTypes: IMAGE_TYPES,
    maxSizeBytes: 2 * MB,
    description: 'Passport-size photograph used on lists and result cards.',
    sortOrder: 1,
  },
  {
    key: 'STUDENT_CNIC_BFORM',
    label: 'CNIC / B-Form',
    ownerType: 'STUDENT',
    isRequired: true,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: "The student's own CNIC, or B-Form if they are under 18.",
    sortOrder: 2,
  },
  {
    key: 'STUDENT_FATHER_CNIC',
    label: "Father's CNIC",
    ownerType: 'STUDENT',
    isRequired: true,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    sortOrder: 3,
  },
  // Most children join a school at PG with no previous record, so neither of
  // these is required; the office asks for them from students who transfer in.
  {
    key: 'STUDENT_PREVIOUS_RESULT',
    label: 'Previous school result card',
    ownerType: 'STUDENT',
    isRequired: false,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'Result card or progress report from the previous school, for a student who transfers in.',
    sortOrder: 4,
  },
  {
    key: 'STUDENT_LEAVING_CERTIFICATE',
    label: 'School leaving certificate',
    ownerType: 'STUDENT',
    isRequired: false,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'Leaving certificate from the previous school, for a student who transfers in.',
    sortOrder: 5,
  },
  {
    key: 'STAFF_PHOTO',
    label: 'Photograph',
    ownerType: 'STAFF',
    isRequired: true,
    isSensitive: false,
    allowedMimeTypes: IMAGE_TYPES,
    maxSizeBytes: 2 * MB,
    sortOrder: 1,
  },
  {
    key: 'STAFF_CNIC',
    label: 'CNIC',
    ownerType: 'STAFF',
    isRequired: true,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    sortOrder: 2,
  },
  {
    key: 'STAFF_CV',
    label: 'CV / Résumé',
    ownerType: 'STAFF',
    isRequired: false,
    isSensitive: true,
    allowedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * MB,
    description: 'Qualifications and experience, as a PDF.',
    sortOrder: 3,
  },
  // Phase 11: files attached to notices and events. Not sensitive -- they are
  // published to an audience -- and never required.
  {
    key: 'NOTICE_ATTACHMENT',
    label: 'Notice attachment',
    ownerType: 'NOTICE',
    isRequired: false,
    isSensitive: false,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'A circular, form or timetable attached to a notice.',
    sortOrder: 1,
  },
  {
    key: 'EVENT_IMAGE',
    label: 'Event picture',
    ownerType: 'EVENT',
    isRequired: false,
    isSensitive: false,
    allowedMimeTypes: IMAGE_TYPES,
    maxSizeBytes: 5 * MB,
    description: 'The picture shown with an event.',
    sortOrder: 1,
  },
  {
    key: 'EVENT_ATTACHMENT',
    label: 'Event attachment',
    ownerType: 'EVENT',
    isRequired: false,
    isSensitive: false,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'A programme, form or map attached to an event.',
    sortOrder: 2,
  },
  // Phase 20: files a teacher attaches to homework -- a worksheet, a scan of
  // the questions, a marking scheme. Seen by the section, never sensitive.
  {
    key: 'HOMEWORK_ATTACHMENT',
    label: 'Homework file',
    ownerType: 'HOMEWORK',
    isRequired: false,
    isSensitive: false,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'A worksheet, reading or scan attached to a piece of homework.',
    sortOrder: 1,
  },
] as const

/**
 * The starting grading scale.
 *
 * A+ 90-100, A 80-89, B 70-79, C 60-69, D 50-59, F below 50 — nothing else. No
 * other scale is seeded, and no remarks text is invented. The school should
 * confirm these bands (or edit them from the Admin portal) before the first
 * result is published.
 *
 * The upper bounds read 89.99 rather than 89 because a percentage is stored to
 * two decimal places: 89.99 is the largest value below the A+ band, so the six
 * bands cover every possible percentage with no gap. The grade is looked up by
 * the band's lower bound in any case (see grading.ts), so a mark of 89.995 could
 * never fall between two grades.
 *
 * The scale is ordinary data. An admin may edit these bands, or add a second
 * scale and make it the default, without any code change.
 */
const GRADE_SCALE = {
  name: 'Nova School Kamalia Scale',
  description: 'Starting scale for school examinations — confirm the bands with the school.',
  bands: [
    { grade: 'A+', minPercentage: '90.00', maxPercentage: '100.00', sortOrder: 1 },
    { grade: 'A', minPercentage: '80.00', maxPercentage: '89.99', sortOrder: 2 },
    { grade: 'B', minPercentage: '70.00', maxPercentage: '79.99', sortOrder: 3 },
    { grade: 'C', minPercentage: '60.00', maxPercentage: '69.99', sortOrder: 4 },
    { grade: 'D', minPercentage: '50.00', maxPercentage: '59.99', sortOrder: 5 },
    { grade: 'F', minPercentage: '0.00', maxPercentage: '49.99', sortOrder: 6 },
  ],
}

const SETTINGS = [
  { key: 'college.name', value: 'Nova School Kamalia', description: 'Displayed across the app' },
  { key: 'college.timezone', value: 'Asia/Karachi', description: 'Used for all date calculations' },
  { key: 'results.ranking_enabled', value: false, description: 'Show position/rank on results' },
  { key: 'results.ranking_scope', value: 'GROUP', description: 'SECTION | GROUP | CLASS' },
  {
    key: 'attendance.leave_counts_as_present',
    value: false,
    description: 'Whether LEAVE counts towards attendance percentage',
  },
]

const CODE_SEQUENCES = [
  { key: 'STUDENT', prefix: 'STU-', nextValue: 1, padding: 4 },
  { key: 'STAFF', prefix: 'STF-', nextValue: 1, padding: 4 },
  { key: 'ADMISSION', prefix: 'ADM-', nextValue: 1, padding: 5 },
  // Fee vouchers (Phase 25). The migration creates this row too, so a database
  // that has migrated can always issue a voucher even if the seed never runs.
  { key: 'FEE_VOUCHER', prefix: 'FV-', nextValue: 1, padding: 6 },
]

async function main() {
  console.log('\nNova School Kamalia — reference seed')
  console.log('This inserts starting data. Everything stays editable in the Admin portal.')

  /* ---------------- Permissions ---------------- */
  heading('Permissions')

  let permissionsCreated = 0
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    const result = await prisma.permission.upsert({
      where: { key },
      // Descriptions may improve over time, so keep them in sync.
      update: { module: meta.module, description: meta.description },
      create: { key, module: meta.module, description: meta.description },
    })
    if (result) permissionsCreated += 1
  }
  console.log(`  ${'permissions'.padEnd(22)} ${permissionsCreated} in catalogue`)

  let rolePermissionsCreated = 0
  let rolePermissionsExisting = 0
  for (const [role, keys] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    for (const permissionKey of keys) {
      const existing = await prisma.rolePermission.findUnique({
        where: { role_permissionKey: { role: role as 'ADMIN', permissionKey } },
      })
      if (existing) {
        rolePermissionsExisting += 1
      } else {
        await prisma.rolePermission.create({ data: { role: role as 'ADMIN', permissionKey } })
        rolePermissionsCreated += 1
      }
    }
  }
  done('role permissions', rolePermissionsCreated, rolePermissionsExisting)

  /* ---------------- Classes ---------------- */
  heading('Academic building blocks')

  let created = 0
  let existing = 0
  for (const klass of CLASSES) {
    const found = await prisma.class.findUnique({ where: { code: klass.code } })
    if (found) existing += 1
    else {
      await prisma.class.create({ data: klass })
      created += 1
    }
  }
  done('classes', created, existing)

  created = 0
  existing = 0
  for (const division of DIVISIONS) {
    const found = await prisma.division.findUnique({ where: { code: division.code } })
    if (found) existing += 1
    else {
      await prisma.division.create({ data: division })
      created += 1
    }
  }
  done('divisions', created, existing)

  created = 0
  existing = 0
  for (const program of PROGRAMS) {
    const found = await prisma.program.findUnique({ where: { code: program.code } })
    if (found) existing += 1
    else {
      await prisma.program.create({ data: program })
      created += 1
    }
  }
  done('programs', created, existing)

  created = 0
  existing = 0
  for (const subject of SUBJECTS) {
    const found = await prisma.subject.findUnique({ where: { name: subject.name } })
    if (found) existing += 1
    else {
      await prisma.subject.create({ data: subject })
      created += 1
    }
  }
  done('subjects', created, existing)

  created = 0
  existing = 0
  for (const designation of DESIGNATIONS) {
    const found = await prisma.designation.findUnique({ where: { name: designation.name } })
    if (found) existing += 1
    else {
      await prisma.designation.create({ data: designation })
      created += 1
    }
  }
  done('designations', created, existing)

  created = 0
  existing = 0
  for (const department of DEPARTMENTS) {
    const found = await prisma.department.findUnique({ where: { name: department.name } })
    if (found) existing += 1
    else {
      await prisma.department.create({ data: department })
      created += 1
    }
  }
  done('departments', created, existing)

  /* ---------------- System ---------------- */
  heading('System')

  created = 0
  existing = 0
  for (const type of DOCUMENT_TYPES) {
    const found = await prisma.documentType.findUnique({ where: { key: type.key } })
    if (found) existing += 1
    else {
      await prisma.documentType.create({
        data: {
          key: type.key,
          label: type.label,
          ownerType: type.ownerType,
          isRequired: type.isRequired,
          isSensitive: type.isSensitive,
          allowedMimeTypes: [...type.allowedMimeTypes],
          maxSizeBytes: type.maxSizeBytes,
          description: 'description' in type ? type.description : null,
          sortOrder: type.sortOrder,
        },
      })
      created += 1
    }
  }
  done('document types', created, existing)

  /* ---------------- Grading ---------------- */
  const scale = await prisma.gradeScale.findUnique({ where: { name: GRADE_SCALE.name } })
  if (scale) {
    done('grading scale', 0, 1)
  } else {
    // The scale and its bands go in together: a scale with no bands would grade
    // nothing, and the exam service treats that as a configuration error.
    await prisma.gradeScale.create({
      data: {
        name: GRADE_SCALE.name,
        description: GRADE_SCALE.description,
        isDefault: true,
        isActive: true,
        bands: { create: GRADE_SCALE.bands },
      },
    })
    done('grading scale', 1, 0)
    console.log(`  ${'grade bands'.padEnd(22)} ${GRADE_SCALE.bands.length} created`)
  }

  created = 0
  existing = 0
  for (const setting of SETTINGS) {
    const found = await prisma.setting.findUnique({ where: { key: setting.key } })
    if (found) existing += 1
    else {
      await prisma.setting.create({
        data: { key: setting.key, value: setting.value, description: setting.description },
      })
      created += 1
    }
  }
  done('settings', created, existing)

  created = 0
  existing = 0
  for (const sequence of CODE_SEQUENCES) {
    const found = await prisma.codeSequence.findUnique({ where: { key: sequence.key } })
    if (found) existing += 1
    else {
      await prisma.codeSequence.create({ data: sequence })
      created += 1
    }
  }
  done('code sequences', created, existing)

  console.log('\nReference seed complete.')
  console.log('Next: npm run seed:structure   (creates the academic session and its groups)\n')
}

main()
  .catch((error) => {
    console.error('\nReference seed failed:\n', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
