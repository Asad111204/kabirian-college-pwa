import { jsonOk, withAuth } from '@/server/api/handler'
import { testDriveConnection } from '@/server/services/google-drive.service'

/**
 * POST /api/v1/settings/google/test
 *
 * Makes a real call to Google and reports what came back — the account it
 * answered for, and how much Drive storage is used. It is not a cached flag, so
 * if the token has been revoked this is where you find out, with a message that
 * says to reconnect.
 *
 * POST rather than GET because it costs an external API call.
 */
export const POST = withAuth(async ({ ctx }) => {
  return jsonOk(await testDriveConnection(ctx))
})
