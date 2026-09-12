/**
 * DEVELOPMENT DEMO DATA — NEVER RUN THIS ON A REAL COLLEGE DATABASE.
 *
 * Creates clearly-labelled fake people so the portals can be tested end to end:
 *   - one teacher   (username: demo.teacher)
 *   - two students   (usernames: demo.student1 / demo.student2)
 * All demo records carry the note "DEMO DATA" and use the DEMO- code prefix, so
 * they are easy to spot and delete.
 *
 *   npm run seed:dev
 *
 * Refuses to run when NODE_ENV=production or when the database already contains
 * real (non-demo) students.
 */
import { hash } from '@node-rs/argon2'
import { assertNotProduction, heading, prisma } from './seed-utils'

const DEMO_PASSWORD = 'DemoPass-2026'
const DEMO_NOTE = 'DEMO DATA — created by npm run seed:dev'

async function hashPassword(password: string) {
  return hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 })
}

async function main() {
  assertNotProduction('seed:dev')

  // Second guard: refuse if real students exist.
  const realStudents = await prisma.student.count({
    where: { studentCode: { not: { startsWith: 'DEMO-' } } },
  })
  if (realStudents > 0) {
    console.error(
      `\nRefusing to run: the database already contains ${realStudents} real student record(s).\n` +
        `Demo data must never be mixed into a live college database.\n`,
    )
    process.exit(1)
  }

  console.log('\nKabirian College — DEVELOPMENT demo data')
  console.log('These are fake people for testing. Do not use in production.')

  const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) {
    console.error('\nNo current academic session. Run `npm run seed:structure` first.\n')
    process.exit(1)
  }

  // Pick a real section from the seeded structure: 1st Year, Boys, Pre-Medical.
  const section = await prisma.section.findFirst({
    where: {
      academicSessionId: session.id,
      academicGroup: { class: { level: 1 }, division: { code: 'B' }, program: { code: 'PM' } },
    },
    include: {
      academicGroup: { include: { class: true, division: true, program: true } },
    },
  })

  if (!section) {
    console.error('\nNo section found for 1st Year / Boys / Pre-Medical. Run `npm run seed:structure`.\n')
    process.exit(1)
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD)

  /* ---------------- Teacher ---------------- */
  heading('Demo staff')

  let teacher = await prisma.staff.findUnique({ where: { staffCode: 'DEMO-STF-0001' } })

  if (!teacher) {
    const user = await prisma.user.create({
      data: {
        username: 'demo.teacher',
        passwordHash,
        role: 'STAFF',
        status: 'ACTIVE',
        mustChangePassword: false, // convenience for testing only
      },
    })

    // Designations are reference data from the Phase 5 seed.
    const lecturer = await prisma.designation.findFirst({ where: { name: 'Lecturer' } })
    if (!lecturer) {
      console.error('\nNo "Lecturer" designation found. Run `npm run seed:reference` first.\n')
      process.exit(1)
    }

    teacher = await prisma.staff.create({
      data: {
        userId: user.id,
        staffCode: 'DEMO-STF-0001',
        fullName: 'Demo Teacher',
        designationId: lecturer.id,
        staffType: 'TEACHING',
        joiningDate: session.startDate,
        employmentStatus: 'ACTIVE',
        notes: DEMO_NOTE,
      },
    })
    console.log('  demo.teacher created (Demo Teacher, DEMO-STF-0001)')
  } else {
    console.log('  demo.teacher already exists')
  }

  // Give the teacher a subject in that section, if the curriculum has one.
  const curriculumEntry = await prisma.curriculumSubject.findFirst({
    where: {
      academicSessionId: session.id,
      classId: section.academicGroup.classId,
      programId: section.academicGroup.programId,
    },
    include: { subject: true },
  })

  if (curriculumEntry) {
    // From Phase 5 the uniqueness is on ACTIVE rows only (a closed assignment
    // is history and may be recreated), so this is a findFirst, not findUnique.
    const existingAssignment = await prisma.teacherAssignment.findFirst({
      where: {
        staffId: teacher.id,
        sectionId: section.id,
        subjectId: curriculumEntry.subjectId,
        isActive: true,
      },
    })

    if (!existingAssignment) {
      await prisma.teacherAssignment.create({
        data: {
          staffId: teacher.id,
          sectionId: section.id,
          subjectId: curriculumEntry.subjectId,
          academicSessionId: session.id,
          assignedAt: session.startDate,
        },
      })
      console.log(`  assigned "${curriculumEntry.subject.name}" in Section ${section.name}`)
    }
  } else {
    console.log('  (no curriculum set yet, so no subject assignment was created)')
  }

  /* ---------------- Students ---------------- */
  heading('Demo students')

  const demoStudents = [
    { code: 'DEMO-STU-0001', username: 'demo.student1', name: 'Demo Student One', father: 'Demo Father One', roll: '101' },
    { code: 'DEMO-STU-0002', username: 'demo.student2', name: 'Demo Student Two', father: 'Demo Father Two', roll: '102' },
  ]

  for (const demo of demoStudents) {
    const existing = await prisma.student.findUnique({ where: { studentCode: demo.code } })
    if (existing) {
      console.log(`  ${demo.username} already exists`)
      continue
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: demo.username,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: false,
        },
      })

      const student = await tx.student.create({
        data: {
          userId: user.id,
          studentCode: demo.code,
          admissionNumber: `DEMO-ADM-${demo.roll}`,
          fullName: demo.name,
          fatherName: demo.father,
          admissionDate: session.startDate,
          admissionSessionId: session.id,
          status: 'ACTIVE',
          notes: DEMO_NOTE,
        },
      })

      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicSessionId: session.id,
          sectionId: section.id,
          rollNumber: demo.roll,
          status: 'ACTIVE',
          startDate: session.startDate,
        },
      })
    })

    console.log(`  ${demo.username} created (${demo.name}, roll ${demo.roll})`)
  }

  const group = section.academicGroup

  console.log(`
============================================================
  DEMO ACCOUNTS  (password for all three: ${DEMO_PASSWORD})
============================================================
  demo.teacher     Staff portal
  demo.student1    Student portal
  demo.student2    Student portal

  All enrolled in:
  ${session.name} > ${group.class.displayName ?? group.class.name} > ${group.division.name} > ${group.program.name} > Section ${section.name}

  This is fake data for testing. Delete it before the
  college's real records are entered.
============================================================
`)
}

main()
  .catch((error) => {
    console.error('\nDemo seed failed:\n', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
