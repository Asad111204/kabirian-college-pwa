import { jsonOk, withAuth } from '@/server/api/handler'
import { unlockUser } from '@/server/services/users.service'

/** Clears the temporary lockout caused by repeated wrong passwords. */
export const POST = withAuth(async ({ ctx, params }) => jsonOk(await unlockUser(ctx, params.id!)))
