import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listDivisions } from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { DivisionsManager } from '@/features/academics/divisions-manager'

export const metadata: Metadata = { title: 'Divisions' }
export const dynamic = 'force-dynamic'

export default async function DivisionsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const divisions = await listDivisions(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Divisions"
        description="How the college separates its student body — currently Boys and Girls. These are ordinary records, so the structure can change later without touching the code."
      />

      <DivisionsManager items={divisions} />

      <Alert variant="info" className="mt-4">
        Divisions are data, not code. If the college changes how it organises students, edit or add
        divisions here.
      </Alert>
    </>
  )
}
