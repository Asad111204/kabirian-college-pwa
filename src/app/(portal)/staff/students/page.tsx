import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getMySections, getMyStudents } from '@/server/services/staff-portal.service'
import { ForbiddenError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { MyStudentsView } from '@/features/staff/my-students-view'

export const metadata: Metadata = { title: 'My students' }
export const dynamic = 'force-dynamic'

/**
 * The students a teacher may see — and only those.
 *
 * Scope is decided on the server from their active assignments and in-charge
 * roles. Requesting a section they do not teach returns 403 rather than an
 * empty list, so an attempt is visible in the logs.
 *
 * The fields shown are a reduced set: name, roll number and placement. CNIC,
 * guardian details, addresses and contact numbers are not even read from the
 * database for this page.
 */
export default async function MyStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['STAFF'])
  const params = await searchParams

  const sectionId = typeof params.sectionId === 'string' ? params.sectionId : undefined
  const search = typeof params.search === 'string' ? params.search : undefined
  const page = Number(typeof params.page === 'string' ? params.page : 1) || 1

  let sections
  try {
    sections = await getMySections(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My students" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record first.
          </Alert>
        </>
      )
    }
    throw error
  }

  if (sections.length === 0) {
    return (
      <>
        <PageHeader title="My students" />
        <Card>
          <CardContent>
            <EmptyState
              icon={Users}
              title="No students yet"
              description="You can see students once you are assigned a subject in a section, or made a section in-charge. Until then there is nothing here."
            />
          </CardContent>
        </Card>
      </>
    )
  }

  /**
   * A section from the URL that is not one of theirs makes the service throw.
   * We catch it and fall back to showing all of their own students, with a
   * notice — the request is still refused, but the page stays usable.
   */
  let result
  let deniedSection = false
  try {
    result = await getMyStudents(ctx, { page, pageSize: 50, search, sectionId })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      deniedSection = true
      result = await getMyStudents(ctx, { page: 1, pageSize: 50, search })
    } else {
      throw error
    }
  }

  return (
    <>
      <PageHeader
        title="My students"
        description="Students in the sections you teach or are in charge of."
      />

      {deniedSection ? (
        <Alert variant="danger" className="mb-4" title="That section is not yours">
          You are not assigned to the section you asked for, so its students are not available to
          you. Showing your own sections instead.
        </Alert>
      ) : null}

      <MyStudentsView
        students={result.items}
        sections={sections.map((s) => ({
          id: s.sectionId,
          label: `${s.className} · ${s.divisionName} · ${s.programName} · Section ${s.sectionName}`,
          studentCount: s.studentCount,
        }))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        filters={{ search: search ?? '', sectionId: deniedSection ? '' : (sectionId ?? '') }}
      />

      <Alert variant="info" className="mt-4">
        You see each student&apos;s name, roll number and class only. Identity documents, addresses
        and guardian contact details are held by the college office.
      </Alert>
    </>
  )
}
