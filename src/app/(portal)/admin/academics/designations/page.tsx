import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listDesignations } from '@/server/services/reference-data.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { DesignationsManager } from '@/features/academics/designations-manager'

export const metadata: Metadata = { title: 'Designations' }
export const dynamic = 'force-dynamic'

/**
 * Job titles used by the college. Reference data, not fixed logic — adding
 * "Senior Lecturer" here makes it selectable on the staff form immediately.
 * Reuses the same managed-list screen as Classes, Divisions and Programs.
 */
export default async function DesignationsPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const designations = await listDesignations(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Designations"
        description="The job titles a staff member can hold — Lecturer, Principal, Lab Assistant and so on."
      />

      <DesignationsManager items={designations} />

      <Alert variant="info" className="mt-4">
        A designation held by any staff member cannot be deleted — deactivate it instead, and every
        existing record keeps its title.
      </Alert>
    </>
  )
}
