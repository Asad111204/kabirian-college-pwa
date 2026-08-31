import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listClasses } from '@/server/services/academic-blocks.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/feedback'
import { ClassesManager } from '@/features/academics/classes-manager'

export const metadata: Metadata = { title: 'Classes / Years' }
export const dynamic = 'force-dynamic'

export default async function ClassesPage() {
  const ctx = await requirePortalAccess(['ADMIN'])
  const classes = await listClasses(ctx, { includeInactive: true })

  return (
    <>
      <PageHeader
        title="Classes / Years"
        description="The academic years the college offers. The level decides the promotion order — a student in level 1 is promoted into level 2."
      />

      <ClassesManager items={classes} />

      <Alert variant="info" className="mt-4">
        Adding a class here (for example a future 3rd Year) needs no code change. Combine it with
        divisions and programs on the Session Structure screen.
      </Alert>
    </>
  )
}
