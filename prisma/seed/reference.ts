/**
 * Reference seed — SAFE TO RUN IN PRODUCTION.
 *
 * It inserts the data the system needs in order to work at all:
 *   - the permission catalogue and each role's defaults,
 *   - Kabirian College's real classes, divisions and programs,
 *   - a starting list of subjects,
 *   - the grading scale the college confirmed,
 *   - system settings and the STU-/STF- code counters.
 *
 * Everything here is EDITABLE afterwards from the Admin portal. These are
 * starting values, not application logic — the code never refers to
 * "Pre-Medical" or "Boys" by name.
 *
 * The script is idempotent: running it twice changes nothing the second time,
 * and it never overwrites a record the admin has since edited.
 *
 *   npm run seed:reference
 */
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../../src/server/auth/permissions'
import { done, heading, prisma } from './seed-utils'

/* --------------------------------------------------------------------------
 * Kabirian College's current structure — confirmed by the college, 2026-08-28.
 * Change any of it later in Admin -> Academic Management.
 * ----------------------------------------------------------------------- */

const CLASSES = [
  { name: '1st Year', displayName: '1st Year / 11th Class', code: '11', level: 1 },
  { name: '2nd Year', displayName: '2nd Year / 12th Class', code: '12', level: 2 },
]

const DIVISIONS = [
  { name: 'Boys', code: 'B', sortOrder: 1 },
  { name: 'Girls', code: 'G', sortOrder: 2 },
]

const PROGRAMS = [
  { name: 'Pre-Medical', code: 'PM', description: 'Intermediate in Pre-Medical', sortOrder: 1 },
  { name: 'Pre-Engineering', code: 'PE', description: 'Intermediate in Pre-Engineering', sortOrder: 2 },
  { name: 'ICS Physics', code: 'ICS-PHY', description: 'Intermediate in Computer Science (with Physics)', sortOrder: 3 },
  { name: 'ICS Economics', code: 'ICS-ECO', description: 'Intermediate in Computer Science (with Economics)', sortOrder: 4 },
  { name: 'FAIT', code: 'FAIT', description: 'Faculty of Arts with Information Technology', sortOrder: 5 },
]

/**
 * A starting subject list. The admin will correct it and then decide, on the
 * Curriculum screen, which program studies which of these.
 */
const SUBJECTS = [
  { name: 'English', code: 'ENG' },
  { name: 'Urdu', code: 'URD' },
  { name: 'Islamiat', code: 'ISL' },
  { name: 'Pakistan Studies', code: 'PST' },
  { name: 'Mathematics', code: 'MATH' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Chemistry', code: 'CHEM' },
  { name: 'Biology', code: 'BIO' },
  { name: 'Computer Science', code: 'CS' },
  { name: 'Economics', code: 'ECO' },
  { name: 'Statistics', code: 'STAT' },
  { name: 'Civics', code: 'CIV' },
  { name: 'Education', code: 'EDU' },
  { name: 'Information Technology', code: 'IT' },
]

/**
 * Job titles used across Pakistani intermediate colleges. Reference data, not
 * fixed logic — the Admin adds to this list from Academic Management.
 */
const DESIGNATIONS = [
  { name: 'Principal', code: 'PRIN', isTeaching: true, sortOrder: 1 },
  { name: 'Vice Principal', code: 'VPRIN', isTeaching: true, sortOrder: 2 },
  { name: 'Professor', code: 'PROF', isTeaching: true, sortOrder: 3 },
  { name: 'Associate Professor', code: 'ASSOC-PROF', isTeaching: true, sortOrder: 4 },
  { name: 'Assistant Professor', code: 'ASST-PROF', isTeaching: true, sortOrder: 5 },
  { name: 'Lecturer', code: 'LECT', isTeaching: true, sortOrder: 6 },
  { name: 'Junior Lecturer', code: 'JR-LECT', isTeaching: true, sortOrder: 7 },
  { name: 'Lab Assistant', code: 'LAB-ASST', isTeaching: false, sortOrder: 8 },
  { name: 'Librarian', code: 'LIB', isTeaching: false, sortOrder: 9 },
  { name: 'Office Superintendent', code: 'OFF-SUP', isTeaching: false, sortOrder: 10 },
  { name: 'Clerk', code: 'CLERK', isTeaching: false, sortOrder: 11 },
  { name: 'Accountant', code: 'ACCT', isTeaching: false, sortOrder: 12 },
]

/** Academic departments a staff member can belong to. Also editable by Admin. */
const DEPARTMENTS = [
  { name: 'Biology', code: 'BIO', sortOrder: 1 },
  { name: 'Chemistry', code: 'CHEM', sortOrder: 2 },
  { name: 'Physics', code: 'PHY', sortOrder: 3 },
  { name: 'Mathematics', code: 'MATH', sortOrder: 4 },
  { name: 'Computer Science', code: 'CS', sortOrder: 5 },
  { name: 'Economics', code: 'ECO', sortOrder: 6 },
  { name: 'English', code: 'ENG', sortOrder: 7 },
  { name: 'Urdu', code: 'URD', sortOrder: 8 },
  { name: 'Islamic Studies', code: 'ISL', sortOrder: 9 },
  { name: 'Administration', code: 'ADMIN', sortOrder: 10 },
]


/**
 * The document checklist the college starts with.
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
  {
    key: 'STUDENT_PREVIOUS_RESULT',
    label: 'Matric result card',
    ownerType: 'STUDENT',
    isRequired: true,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
    description: 'Result card or detailed marks certificate from the previous board.',
    sortOrder: 4,
  },
  {
    key: 'STUDENT_MATRIC_ROLL_SLIP',
    label: 'Matric roll number slip',
    ownerType: 'STUDENT',
    isRequired: false,
    isSensitive: true,
    allowedMimeTypes: SCAN_TYPES,
    maxSizeBytes: 10 * MB,
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
] as const

/**
 * The grading scale Kabirian College confirmed for Phase 8.
 *
 * A+ 90-100, A 80-89, B 70-79, C 60-69, D 50-59, F below 50 — nothing else. No
 * other scale is seeded, and no remarks text is invented.
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
  name: 'Kabirian College Scale',
  description: 'Confirmed by the college for intermediate examinations.',
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
  { key: 'college.name', value: 'Kabirian College', description: 'Displayed across the app' },
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
]

async function main() {
  console.log('\nKabirian College — reference seed')
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
  console.log('Next: npm run seed:structure   (creates the academic session and its 20 groups)\n')
}

main()
  .catch((error) => {
    console.error('\nReference seed failed:\n', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
