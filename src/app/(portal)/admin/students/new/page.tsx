import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { listAcademicSessions } from '@/server/services/academic-structure.service'
import { peekNextCode } from '@/server/services/code-sequence'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { AddStudentForm } from '@/features/students/add-student-form'

export const metadata: Metadata = { title: 'Add student' }
export const dynamic = 'force-dynamic'

export default async function AddStudentPage() {
  const ctx = await requirePortalAccess(['ADMIN'])

  const [sessions, nextStudentCode, nextAdmissionNumber] = await Promise.all([
    listAcademicSessions(ctx),
    peekNextCode('STUDENT'),
    peekNextCode('ADMISSION'),
  ])

  const currentSession = sessions.find((s) => s.isCurrent) ?? sessions[0]

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href="/admin/students">
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </Link>
      </Button>

      <PageHeader
        title="Add student"
        description="Admit a student and place them in the academic structure."
      />

      {sessions.length === 0 ? (
        <Alert variant="warning" title="No academic session yet">
          Create an academic session and its structure first.{' '}
          <Link href="/admin/academics/sessions">Go to Academic Sessions</Link>
        </Alert>
      ) : (
        <AddStudentForm
          sessions={sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }))}
          defaultSessionId={currentSession?.id ?? ''}
          nextStudentCode={nextStudentCode}
          nextAdmissionNumber={nextAdmissionNumber}
        />
      )}
    </>
  )
}
