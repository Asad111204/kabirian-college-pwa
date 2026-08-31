import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { SessionsManager } from '@/features/academics/sessions-manager'

export const metadata: Metadata = { title: 'Academic Sessions' }
export const dynamic = 'force-dynamic'

export default async function AcademicSessionsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const sessions = await listAcademicSessions(ctx)

  return (
    <>
      <PageHeader
        title="Academic Sessions"
        description="Each academic year is a session. Records belong to the session they were created in, so closing a year never deletes anything."
      />

      <SessionsManager
        sessions={sessions.map((session) => ({
          ...session,
          startDate: session.startDate.toISOString().slice(0, 10),
          endDate: session.endDate.toISOString().slice(0, 10),
        }))}
      />

      <Alert variant="info" className="mt-4">
        Exactly one session can be the <strong>current</strong> one. New enrolments, attendance and
        exams belong to it. Older sessions stay fully readable.
      </Alert>
    </>
  )
}
