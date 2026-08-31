import Link from 'next/link'
import type { Metadata } from 'next'
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getAdminDashboard } from '@/server/services/dashboard.service'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { StatRow, StatTile } from '@/features/dashboard/stat-tiles'
import { StructureOverview } from '@/features/dashboard/structure-overview'
import { RecentActivity } from '@/features/dashboard/recent-activity'
import { QuickActions } from '@/features/dashboard/quick-actions'
import { UpcomingModules } from '@/features/dashboard/upcoming-modules'
import { RefreshButton } from '@/features/dashboard/refresh-button'

export const metadata: Metadata = { title: 'Dashboard' }

/**
 * Rendered fresh on every visit, so the figures always reflect the database as
 * it is right now. No caching to go stale, and no background polling.
 */
export const dynamic = 'force-dynamic'

/**
 * Admin dashboard.
 *
 * Every number comes from the database through `getAdminDashboard`, which is
 * also what `GET /api/v1/dashboard` returns. Modules that have not been built
 * contribute no figures at all — they are listed as "not built yet" instead,
 * because a zero would be read as real information.
 */
export default async function AdminDashboardPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const data = await getAdminDashboard(ctx)

  const { users, academics, people, currentSession } = data

  return (
    <>
      <PageHeader
        title={`Welcome back, ${ctx.fullName}`}
        description={
          currentSession
            ? `Kabirian College · academic session ${currentSession.name}`
            : 'Kabirian College'
        }
        actions={<RefreshButton generatedAt={data.generatedAt.toISOString()} />}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Things that need the administrator's attention                    */}
      {/* ---------------------------------------------------------------- */}
      {!currentSession ? (
        <Alert variant="warning" title="No current academic session" className="mb-5">
          Create a session and mark it as current before adding students or staff.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      ) : null}

      {currentSession && academics && academics.academicGroups === 0 ? (
        <Alert variant="warning" title="This session has no structure yet" className="mb-5">
          Choose which class, division and program combinations are running this year.{' '}
          <Link href="/admin/academics/structure">Build the session structure</Link>
        </Alert>
      ) : null}

      {currentSession && academics && academics.academicGroups > 0 && academics.curriculumEntries === 0 ? (
        <Alert variant="info" title="No subjects assigned yet" className="mb-5">
          Each program still needs its subject list before exams and timetables can be set up.{' '}
          <Link href="/admin/academics/curriculum">Set the curriculum</Link>
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Overview tiles                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="mb-5" aria-label="Overview">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {users ? (
            <StatTile
              label="User accounts"
              value={users.total}
              icon={Users}
              href="/admin/users"
              hint={`${users.active} active · ${users.inactive} inactive`}
              emphasis
            />
          ) : null}

          <StatTile
            label="Students"
            value={people?.students ?? 0}
            icon={GraduationCap}
            hint={people?.students === 0 ? 'None added yet — Phase 4' : 'Enrolled records'}
          />

          <StatTile
            label="Staff"
            value={people?.staff ?? 0}
            icon={UserCog}
            hint={people?.staff === 0 ? 'None added yet — Phase 5' : 'Personnel records'}
          />

          {academics ? (
            <StatTile
              label="Sections"
              value={academics.sections}
              icon={LayoutDashboard}
              href="/admin/academics/structure"
              hint={currentSession ? `In ${currentSession.name}` : undefined}
            />
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Academic building blocks                                          */}
      {/* ---------------------------------------------------------------- */}
      {academics ? (
        <section className="mb-5" aria-label="Academic statistics">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label="Classes / Years"
              value={academics.classes}
              icon={GraduationCap}
              href="/admin/academics/classes"
            />
            <StatTile
              label="Divisions"
              value={academics.divisions}
              icon={Users}
              href="/admin/academics/divisions"
            />
            <StatTile
              label="Programs"
              value={academics.programs}
              icon={Layers}
              href="/admin/academics/programs"
            />
            <StatTile
              label="Subjects"
              value={academics.subjects}
              icon={BookOpen}
              href="/admin/academics/subjects"
            />
            <StatTile
              label="Academic groups"
              value={academics.academicGroups}
              icon={LayoutDashboard}
              href="/admin/academics/structure"
              hint={currentSession ? 'Class × Division × Program' : undefined}
            />
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Main grid                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {data.structure ? (
            <StructureOverview
              structure={data.structure}
              sessionName={currentSession?.name ?? null}
              canManage={ctx.permissions.has('academics.manage')}
            />
          ) : null}

          <UpcomingModules modules={data.upcomingModules} />
        </div>

        <div className="space-y-4">
          <QuickActions actions={data.quickActions} />

          {/* People */}
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
              {users ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/users">Manage</Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2.5">
              {users ? (
                <>
                  <StatRow label="Administrators" value={users.byRole.ADMIN} />
                  <StatRow label="Staff accounts" value={users.byRole.STAFF} />
                  <StatRow label="Student accounts" value={users.byRole.STUDENT} />
                  <div className="border-t border-border pt-2.5">
                    <StatRow label="Active" value={users.active} />
                    <StatRow label="Inactive" value={users.inactive} muted />
                  </div>
                </>
              ) : null}

              <div className="border-t border-border pt-2.5">
                <StatRow label="Student records" value={people?.students ?? 0} muted />
                <StatRow label="Staff records" value={people?.staff ?? 0} muted />
                <p className="mt-1.5 text-xs text-foreground-subtle">
                  Student and staff records are created in Phases 4 and 5. Sign-in accounts can be
                  created now.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Current session */}
          {currentSession ? (
            <Card>
              <CardHeader>
                <CardTitle>Current session</CardTitle>
                <Badge variant="brand">{currentSession.name}</Badge>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <StatRow label="Starts" value={formatDate(currentSession.startDate)} />
                <StatRow label="Ends" value={formatDate(currentSession.endDate)} />
                <StatRow label="Status" value={currentSession.status} />
                {academics ? (
                  <>
                    <StatRow label="Curriculum entries" value={academics.curriculumEntries} />
                    <StatRow
                      label="Enrolled students"
                      value={people?.studentsEnrolledThisSession ?? 0}
                      muted={(people?.studentsEnrolledThisSession ?? 0) === 0}
                    />
                  </>
                ) : null}
                <div className="pt-1">
                  <Button variant="secondary" size="sm" asChild className="w-full">
                    <Link href="/admin/academics/sessions">
                      <CalendarDays className="h-4 w-4" />
                      All sessions ({data.totalSessions})
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.recentActivity ? <RecentActivity items={data.recentActivity} /> : null}

          {!data.recentActivity ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-start gap-2 text-sm text-foreground-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  You do not have permission to view the audit log, so recent activity is hidden.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-start gap-2 text-sm text-foreground-muted">
                <ScrollText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                The project plan, architecture decisions and setup guide live in the project folder:
                PROJECT_PLAN.md, DECISIONS.md and README.md.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
