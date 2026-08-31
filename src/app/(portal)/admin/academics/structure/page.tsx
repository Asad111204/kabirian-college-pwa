import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import {
  listAcademicGroups,
  listAcademicSessions,
} from '@/server/services/academic-structure.service'
import {
  listClasses,
  listDivisions,
  listPrograms,
} from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { StructureBuilder } from '@/features/academics/structure-builder'

export const metadata: Metadata = { title: 'Session Structure' }
export const dynamic = 'force-dynamic'

/**
 * Academic Management -> Session Structure.
 *
 * Shows which Class x Division x Program combinations exist in the chosen
 * session, and lets the admin add or remove them and manage their sections.
 */
export default async function StructurePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { session: sessionParam } = await searchParams

  const sessions = await listAcademicSessions(ctx)
  const selectedSession =
    sessions.find((s) => s.id === sessionParam) ?? sessions.find((s) => s.isCurrent) ?? sessions[0]

  if (!selectedSession) {
    return (
      <>
        <PageHeader title="Session Structure" />
        <Alert variant="warning" title="No academic session yet">
          Create an academic session first, then come back to build its structure.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      </>
    )
  }

  const [classes, divisions, programs, groups] = await Promise.all([
    listClasses(ctx),
    listDivisions(ctx),
    listPrograms(ctx),
    listAcademicGroups(ctx, selectedSession.id),
  ])

  return (
    <>
      <PageHeader
        title="Session Structure"
        description="Tick a box to create that Class · Division · Program combination for the session. Each one starts with Section A, and you can add more sections at any time."
      />

      <StructureBuilder
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
        selectedSessionId={selectedSession.id}
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName,
          level: c.level,
        }))}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
        programs={programs.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        groups={groups}
      />

      {classes.length === 0 || divisions.length === 0 || programs.length === 0 ? (
        <Alert variant="warning" className="mt-4" title="Missing building blocks">
          You need at least one active class, division and program before a structure can be built.
        </Alert>
      ) : null}
    </>
  )
}
