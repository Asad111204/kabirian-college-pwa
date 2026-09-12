import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePortalAccess } from '@/server/auth/context'
import { listSubjects } from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { SubjectsManager } from '@/features/academics/subjects-manager'

export const metadata: Metadata = { title: 'Subjects' }
export const dynamic = 'force-dynamic'

export default async function SubjectsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const { items: subjects } = await listSubjects(ctx, { includeInactive: true, pageSize: 100 })

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The master list of subjects taught at the college. Which programs study which subjects is set on the Curriculum screen."
      />

      <SubjectsManager items={subjects} />

      <Alert variant="info" className="mt-4">
        A subject on this list is not yet taught anywhere. Assign it to a class and program on the{' '}
        <Link href="/admin/academics/curriculum">Curriculum</Link> screen — different programs can
        have completely different subject combinations.
      </Alert>
    </>
  )
}
