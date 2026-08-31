import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, ClipboardList, GraduationCap, Layers, ShieldCheck, Users } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getMySections, getStaffDashboard } from '@/server/services/staff-portal.service'
import { ForbiddenError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { StatTile } from '@/features/dashboard/stat-tiles'

export const metadata: Metadata = { title: 'Staff dashboard' }
export const dynamic = 'force-dynamic'

/**
 * The teacher's own dashboard.
 *
 * Every figure comes from their own assignments. A teacher with no assignments
 * sees zeros and an explanation — never another teacher's numbers, and never a
 * made-up figure for a module that does not exist yet.
 */
export default async function StaffDashboardPage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let dashboard
  try {
    dashboard = await getStaffDashboard(ctx)
  } catch (error) {
    // A staff login that is not linked to a staff record has no scope at all.
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="Staff portal" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record before your
            assignments and students appear here.
          </Alert>
        </>
      )
    }
    throw error
  }

  const sections = await getMySections(ctx, dashboard.currentSession?.id)

  return (
    <>
      <PageHeader
        title={`Welcome, ${dashboard.fullName}`}
        description={
          dashboard.currentSession
            ? `${dashboard.designation}${dashboard.department ? ` · ${dashboard.department}` : ''} · Session ${dashboard.currentSession.name}`
            : `${dashboard.designation}${dashboard.department ? ` · ${dashboard.department}` : ''}`
        }
        actions={<Badge variant="neutral">{dashboard.staffCode}</Badge>}
      />

      {!dashboard.currentSession ? (
        <Alert variant="warning" className="mb-5" title="No current academic session">
          The college has not set a current academic session yet.
        </Alert>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="My teaching">
        <StatTile
          label="Subject assignments"
          value={dashboard.activeAssignments}
          icon={BookOpen}
          href="/staff/assignments"
          emphasis
        />
        <StatTile label="Sections" value={dashboard.sectionsTaught} icon={Layers} />
        <StatTile label="Subjects" value={dashboard.subjectsTaught} icon={ClipboardList} />
        <StatTile
          label="Students"
          value={dashboard.studentsInScope}
          icon={Users}
          href={dashboard.studentsInScope > 0 ? '/staff/students' : undefined}
          hint={dashboard.studentsInScope === 0 ? 'In your sections' : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>My sections</CardTitle>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  The sections you teach in, and what you teach there.
                </p>
              </div>
              {sections.length > 0 ? (
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/staff/students">View students</Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {sections.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  title="No assignments yet"
                  description="Once the college office assigns you subjects or sections, they will appear here along with your students."
                />
              ) : (
                <ul className="space-y-2">
                  {sections.map((section) => (
                    <li
                      key={section.sectionId}
                      className="rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {section.className} · {section.divisionName} · {section.programName} · Section{' '}
                          {section.sectionName}
                        </p>
                        {section.isIncharge ? (
                          <Badge variant="brand">
                            <ShieldCheck className="h-3 w-3" />
                            In-charge
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-foreground-muted">
                        {section.subjects.length > 0
                          ? section.subjects.join(', ')
                          : 'Section in-charge only'}
                        {' · '}
                        {section.studentCount} student{section.studentCount === 1 ? '' : 's'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href="/staff/assignments">
                  <BookOpen className="h-4 w-4" />
                  My assignments
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/staff/students">
                  <Users className="h-4 w-4" />
                  My students
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/staff/profile">
                  <GraduationCap className="h-4 w-4" />
                  My profile
                </Link>
              </Button>
            </CardContent>
          </Card>

          {dashboard.sectionsInCharge > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Section in-charge</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground-muted">
                  You are the in-charge of {dashboard.sectionsInCharge} section
                  {dashboard.sectionsInCharge === 1 ? '' : 's'}, which gives you access to all of
                  their students.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Not built yet</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  { name: 'Attendance', phase: 7 },
                  { name: 'Exams & marks', phase: 8 },
                  { name: 'Results', phase: 9 },
                  { name: 'Timetable', phase: 10 },
                ].map((module) => (
                  <li
                    key={module.name}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-dashed border-border p-3 text-sm"
                  >
                    <span className="text-foreground-muted">{module.name}</span>
                    <Badge variant="neutral">Phase {module.phase}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
