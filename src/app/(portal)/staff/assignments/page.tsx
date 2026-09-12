import type { Metadata } from 'next'
import { BookOpen, ShieldCheck, Users } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getMyAssignments, getMySections } from '@/server/services/staff-portal.service'
import { ForbiddenError } from '@/server/api/errors'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState } from '@/components/ui/feedback'

export const metadata: Metadata = { title: 'My assignments' }
export const dynamic = 'force-dynamic'

/**
 * The teacher's own assignments.
 *
 * The staff id is taken from the signed-in session, never from the URL, so this
 * page can only ever show the person their own work.
 */
export default async function MyAssignmentsPage() {
  const ctx = await requirePortalAccess(['STAFF'])

  let assignments
  let sections
  try {
    ;[assignments, sections] = await Promise.all([getMyAssignments(ctx), getMySections(ctx)])
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title="My assignments" />
          <Alert variant="warning" title="Your account is not linked to a staff record">
            The college office needs to connect this login to your staff record first.
          </Alert>
        </>
      )
    }
    throw error
  }

  // Group by academic session so past years stay separate.
  const bySession = new Map<string, typeof assignments>()
  for (const assignment of assignments) {
    const list = bySession.get(assignment.sessionName) ?? []
    list.push(assignment)
    bySession.set(assignment.sessionName, list)
  }

  const inchargeOnly = sections.filter((s) => s.isIncharge && s.subjects.length === 0)

  return (
    <>
      <PageHeader
        title="My assignments"
        description="The subjects and sections you are responsible for."
      />

      {assignments.length === 0 && inchargeOnly.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BookOpen}
              title="No assignments yet"
              description="The college office assigns teachers to subjects and sections. Once that is done, your classes and students appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...bySession.entries()].map(([sessionName, list]) => (
            <Card key={sessionName}>
              <CardHeader>
                <CardTitle>{sessionName}</CardTitle>
                <Badge variant="neutral">
                  {list.length} assignment{list.length === 1 ? '' : 's'}
                </Badge>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {list.map((assignment) => (
                    <li
                      key={assignment.id}
                      className="rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{assignment.subjectName}</p>
                        {assignment.isIncharge ? (
                          <Badge variant="brand">
                            <ShieldCheck className="h-3 w-3" />
                            In-charge
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-foreground-muted">
                        {assignment.className} · {assignment.divisionName} · {assignment.programName} ·
                        Section {assignment.sectionName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground-subtle">
                        <Users className="h-3 w-3" />
                        {assignment.studentCount} student{assignment.studentCount === 1 ? '' : 's'} ·
                        since {formatDate(assignment.assignedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          {inchargeOnly.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Section in-charge</CardTitle>
                  <p className="mt-0.5 text-sm text-foreground-muted">
                    Sections you are responsible for without teaching a subject in them.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {inchargeOnly.map((section) => (
                    <li
                      key={section.sectionId}
                      className="rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {section.className} · {section.divisionName} · {section.programName} · Section{' '}
                        {section.sectionName}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground-muted">
                        {section.sessionName} · {section.studentCount} student
                        {section.studentCount === 1 ? '' : 's'}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  )
}
