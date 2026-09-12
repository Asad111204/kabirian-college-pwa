import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listPrograms } from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { ProgramsManager } from '@/features/academics/programs-manager'

export const metadata: Metadata = { title: 'Programs' }
export const dynamic = 'force-dynamic'

/**
 * Academic Management -> Programs.
 *
 * Pre-Medical, Pre-Engineering, ICS Physics, ICS Economics and FAIT are seeded
 * starting data — the application contains no logic that depends on them. Adding
 * "I.Com" here makes it selectable everywhere at once (requirement 13).
 */
export default async function ProgramsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const programs = await listPrograms(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Programs"
        description="The academic groups students can be enrolled in. Add a new one at any time — it becomes available across the whole system immediately."
      />

      <ProgramsManager items={programs} />

      <Alert variant="info" className="mt-4">
        Deactivating a program hides it when creating new groups and enrolments, but keeps every
        existing student record, attendance entry and result exactly as it is.
      </Alert>
    </>
  )
}
