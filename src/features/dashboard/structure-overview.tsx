import Link from 'next/link'
import { Layers } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import type { StructureClassNode } from '@/server/services/dashboard-helpers'

/**
 * The college's academic structure for the current session, read from the
 * database on every load.
 *
 * Nothing here is written into the code: whatever classes, divisions and
 * programs the administrator has created is what appears. Adding a new program
 * such as "I.Com" in Academic Management makes it show up here immediately.
 */
export function StructureOverview({
  structure,
  sessionName,
  canManage,
}: {
  structure: StructureClassNode[]
  sessionName: string | null
  canManage: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Academic structure</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {sessionName ? `Session ${sessionName}` : 'No current session set'}
          </p>
        </div>
        {canManage ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href="/admin/academics/structure">Manage structure</Link>
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {structure.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No structure for this session yet"
            description="Create the class, division and program combinations the college is running this year."
            action={
              canManage ? (
                <Button size="sm" asChild>
                  <Link href="/admin/academics/structure">Build the structure</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {structure.map((classNode) => (
              <section key={classNode.classId}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{classNode.className}</h3>
                  <Badge variant="neutral">
                    {classNode.programCount} group{classNode.programCount === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="neutral">
                    {classNode.sectionCount} section{classNode.sectionCount === 1 ? '' : 's'}
                  </Badge>
                  {classNode.studentCount > 0 ? (
                    <Badge variant="brand">
                      {classNode.studentCount} student{classNode.studentCount === 1 ? '' : 's'}
                    </Badge>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {classNode.divisions.map((division) => (
                    <div
                      key={division.divisionId}
                      className="rounded-[var(--radius-control)] border border-border p-3"
                    >
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        {division.divisionName}
                      </p>

                      <ul className="space-y-1">
                        {division.programs.map((program) => (
                          <li
                            key={program.programId}
                            className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm"
                          >
                            <span className="min-w-0 truncate text-foreground">
                              {program.programName}
                            </span>
                            <span className="shrink-0 text-xs text-foreground-subtle">
                              {program.sectionNames.length > 0
                                ? `Section ${program.sectionNames.join(', ')}`
                                : 'no sections'}
                              {program.studentCount > 0 ? ` · ${program.studentCount}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
