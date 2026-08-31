import { jsonOk, withAuth } from '@/server/api/handler'
import { listUnlinkedProfiles } from '@/server/services/users.service'

/**
 * Staff and student records that do not have a login account yet, so the
 * "create account" form can offer to link one.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const search = new URL(request.url).searchParams.get('search') ?? undefined
  return jsonOk(await listUnlinkedProfiles(ctx, search))
})
