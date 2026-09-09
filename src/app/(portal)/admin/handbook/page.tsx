import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { getCurrentAcademicSession } from '@/server/services/academic-structure.service'
import { env } from '@/server/config/env'
import { PageHeader } from '@/components/layout/app-shell'
import { HandbookDocument } from '@/features/handbook/handbook-document'

export const metadata: Metadata = { title: 'Handbook' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Handbook. The whole system explained, as a document the office can
 * save as a PDF and hand to somebody.
 */
export default async function HandbookPage() {
  await requirePortalAccess(['ADMIN'])
  const session = await getCurrentAcademicSession()

  return (
    <>
      <PageHeader
        title="Handbook"
        description="Everything this system does, who may do it, and the rules it keeps. Print it or save it as a PDF."
      />
      <HandbookDocument collegeName={env.APP_COLLEGE_NAME} sessionName={session?.name ?? null} />
    </>
  )
}
