/**
 * Structure seed — SAFE TO RUN IN PRODUCTION.
 *
 * Creates the academic session and builds every Class x Division x Program
 * combination that currently exists, each with a Section A:
 *
 *   2 classes x 2 divisions x 5 programs = 20 academic groups
 *
 * This is real configuration, not demo data. It is exactly what the admin would
 * otherwise click together on the Session Structure screen — the script only
 * saves time on first setup.
 *
 *   npm run seed:structure                 (uses the session below)
 *   npm run seed:structure -- 2027-28      (or name one explicitly)
 *
 * Running it again is safe: existing combinations are skipped.
 */
import { done, heading, prisma } from './seed-utils'

/**
 * Default academic session. The college's year runs August–July, so we take the
 * calendar year (or the previous one before August) as the starting year.
 */
function defaultSessionName(): string {
  const now = new Date()
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

function sessionDates(name: string): { startDate: Date; endDate: Date } {
  const startYear = Number(name.slice(0, 4))
  return {
    startDate: new Date(Date.UTC(startYear, 7, 1)), // 1 August
    endDate: new Date(Date.UTC(startYear + 1, 6, 31)), // 31 July
  }
}

async function main() {
  const sessionName = process.argv[2] ?? defaultSessionName()

  console.log('\nKabirian College — academic structure seed')
  console.log(`Session: ${sessionName}`)

  /* ---------------- Academic session ---------------- */
  heading('Academic session')

  let session = await prisma.academicSession.findUnique({ where: { name: sessionName } })

  if (session) {
    console.log(`  ${sessionName} already exists`)
  } else {
    const { startDate, endDate } = sessionDates(sessionName)
    const anyCurrent = await prisma.academicSession.findFirst({ where: { isCurrent: true } })

    session = await prisma.academicSession.create({
      data: {
        name: sessionName,
        startDate,
        endDate,
        status: anyCurrent ? 'UPCOMING' : 'ACTIVE',
        // Only become the current session if no other session holds that role.
        isCurrent: !anyCurrent,
      },
    })
    console.log(
      `  ${sessionName} created${session.isCurrent ? ' and marked as the CURRENT session' : ''}`,
    )
  }

  /* ---------------- Groups and sections ---------------- */
  heading('Academic groups (Class x Division x Program)')

  const [classes, divisions, programs] = await Promise.all([
    prisma.class.findMany({ where: { isActive: true }, orderBy: { level: 'asc' } }),
    prisma.division.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.program.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  if (classes.length === 0 || divisions.length === 0 || programs.length === 0) {
    console.error(
      '\n  No classes, divisions or programs found.\n' +
        '  Run `npm run seed:reference` first.\n',
    )
    process.exit(1)
  }

  console.log(
    `  ${classes.length} classes x ${divisions.length} divisions x ${programs.length} programs ` +
      `= ${classes.length * divisions.length * programs.length} combinations`,
  )

  let groupsCreated = 0
  let groupsExisting = 0
  let sectionsCreated = 0

  for (const klass of classes) {
    for (const division of divisions) {
      for (const program of programs) {
        const existing = await prisma.academicGroup.findUnique({
          where: {
            academicSessionId_classId_divisionId_programId: {
              academicSessionId: session.id,
              classId: klass.id,
              divisionId: division.id,
              programId: program.id,
            },
          },
        })

        if (existing) {
          groupsExisting += 1
          continue
        }

        // The group and its first section are created together.
        await prisma.$transaction(async (tx) => {
          const group = await tx.academicGroup.create({
            data: {
              academicSessionId: session!.id,
              classId: klass.id,
              divisionId: division.id,
              programId: program.id,
            },
          })

          await tx.section.create({
            data: {
              academicGroupId: group.id,
              academicSessionId: session!.id,
              name: 'A',
            },
          })
        })

        groupsCreated += 1
        sectionsCreated += 1
      }
    }
  }

  done('academic groups', groupsCreated, groupsExisting)
  done('sections', sectionsCreated, 0)

  /* ---------------- Summary ---------------- */
  heading('Structure now in the database')

  const groups = await prisma.academicGroup.findMany({
    where: { academicSessionId: session.id },
    include: { class: true, division: true, program: true, sections: true },
    orderBy: [
      { class: { level: 'asc' } },
      { division: { sortOrder: 'asc' } },
      { program: { sortOrder: 'asc' } },
    ],
  })

  let lastHeading = ''
  for (const group of groups) {
    const currentHeading = `${group.class.displayName ?? group.class.name} > ${group.division.name}`
    if (currentHeading !== lastHeading) {
      console.log(`  ${currentHeading}`)
      lastHeading = currentHeading
    }
    console.log(
      `      ${group.program.name.padEnd(18)} sections: ${group.sections.map((s) => s.name).join(', ')}`,
    )
  }

  console.log(`\n  Total: ${groups.length} groups`)
  console.log('\nStructure seed complete.')
  console.log('Next: npm run create-admin   (creates your first administrator account)\n')
}

main()
  .catch((error) => {
    console.error('\nStructure seed failed:\n', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
