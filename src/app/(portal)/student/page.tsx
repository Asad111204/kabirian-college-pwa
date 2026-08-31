import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { prisma } from '@/server/db/prisma'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'

export const metadata: Metadata = { title: 'Student dashboard' }
export const dynamic = 'force-dynamic'

export default async function StudentDashboardPage() {
  const ctx = await requirePortalAccess(['STUDENT'])

  /**
   * A student only ever reads their OWN enrollment. `studentId` comes from the
   * signed-in session, never from the URL — so changing an id in the address bar
   * cannot show another student's record.
   */
  const enrollment = ctx.studentId
    ? await prisma.studentEnrollment.findFirst({
        where: { studentId: ctx.studentId, status: 'ACTIVE' },
        include: {
          section: {
            include: {
              academicGroup: {
                include: { class: true, division: true, program: true, academicSession: true },
              },
            },
          },
          student: { select: { studentCode: true, fullName: true } },
        },
        orderBy: { startDate: 'desc' },
      })
    : null

  const group = enrollment?.section.academicGroup

  return (
    <>
      <PageHeader
        title={`Welcome, ${ctx.fullName}`}
        description={enrollment ? undefined : 'Your enrolment details are not available yet.'}
      />

      <Card>
        <CardHeader>
          <CardTitle>My details</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollment && group ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Student ID" value={enrollment.student.studentCode} />
              <Detail label="Academic session" value={group.academicSession.name} />
              <Detail label="Class" value={group.class.displayName ?? group.class.name} />
              <Detail label="Division" value={group.division.name} />
              <Detail label="Program" value={group.program.name} />
              <Detail label="Section" value={enrollment.section.name} />
              <Detail label="Roll number" value={enrollment.rollNumber ?? '—'} />
            </dl>
          ) : (
            <p className="text-sm text-foreground-muted">
              You are not enrolled in the current academic session yet. Please contact the college
              office.
            </p>
          )}
        </CardContent>
      </Card>

      <Alert variant="info" className="mt-4">
        Your attendance, timetable, exam schedule and results appear here as those parts of the
        system are completed (Phases 7–10).
      </Alert>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}
