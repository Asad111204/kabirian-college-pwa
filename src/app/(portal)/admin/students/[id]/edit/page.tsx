import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { authorize, requirePortalAccess } from '@/server/auth/context'
import { getStudent } from '@/server/services/students.service'
import { NotFoundError } from '@/server/api/errors'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { EditStudentForm } from '@/features/students/edit-student-form'
import { studentDetailsFrom } from '@/features/students/student-details'

export const metadata: Metadata = { title: 'Edit student' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Students → one student → Edit.
 *
 * `students.update` is required to open the page at all, so somebody without
 * it gets the 403 page rather than a form that fails on save. The API checks
 * it again — this is the courtesy, not the lock.
 */
export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalAccess(['ADMIN'])
  authorize(ctx, 'students.update')

  const { id } = await params

  let student
  try {
    student = await getStudent(ctx, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href={`/admin/students/${student.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to {student.fullName}
        </Link>
      </Button>

      <PageHeader
        title={`Edit ${student.fullName}`}
        description={`${student.studentCode} · every detail the school holds about this student`}
      />

      <EditStudentForm
        studentId={student.id}
        studentCode={student.studentCode}
        initial={studentDetailsFrom(student)}
      />
    </>
  )
}
