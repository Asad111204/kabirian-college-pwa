import { jsonOk, withAuth } from '@/server/api/handler'
import { getMyStudents } from '@/server/services/staff-portal.service'

/**
 * Students in the teacher's OWN sections, in a reduced view.
 *
 * Scope: only sections where they hold an active assignment or are the
 * in-charge. Asking for any other section returns 403.
 *
 * Fields: enough to take a register. CNIC, guardian details, addresses and
 * contact numbers are never read from the database by this endpoint.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') ?? 1)
  const pageSize = Math.min(Number(params.get('pageSize') ?? 50), 100)

  return jsonOk(
    await getMyStudents(ctx, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
      search: params.get('search') ?? undefined,
      sectionId: params.get('sectionId') ?? undefined,
      academicSessionId: params.get('sessionId') ?? undefined,
    }),
  )
})
