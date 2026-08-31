import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { listDepartments, listDesignations } from '@/server/services/reference-data.service'
import { peekNextCode } from '@/server/services/code-sequence'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { AddStaffForm } from '@/features/staff/add-staff-form'

export const metadata: Metadata = { title: 'Add staff' }
export const dynamic = 'force-dynamic'

export default async function AddStaffPage() {
  const ctx = await requirePortalAccess(['ADMIN'])

  const [designations, departments, nextStaffCode] = await Promise.all([
    listDesignations(ctx),
    listDepartments(ctx),
    peekNextCode('STAFF'),
  ])

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link href="/admin/staff">
          <ArrowLeft className="h-4 w-4" />
          Back to staff
        </Link>
      </Button>

      <PageHeader title="Add staff member" description="Record a teacher or other staff member." />

      {designations.length === 0 ? (
        <Alert variant="warning" title="No designations yet">
          Add at least one designation before recording staff.{' '}
          <Link href="/admin/academics/designations">Go to Designations</Link>
        </Alert>
      ) : (
        <AddStaffForm
          designations={designations.map((d) => ({ id: d.id, name: d.name, isTeaching: d.isTeaching }))}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          nextStaffCode={nextStaffCode}
        />
      )}
    </>
  )
}
