import { jsonOk, clientIp, withAuth } from '@/server/api/handler'
import { disconnectDrive, getDriveStatus } from '@/server/services/google-drive.service'

/**
 * GET /api/v1/settings/google — the current connection state.
 *
 * Returns which account is connected and whether the configuration is complete.
 * It never returns the refresh token, the client secret or the encryption key,
 * because the service that builds this response has no access to them.
 */
export const GET = withAuth(async ({ ctx }) => {
  return jsonOk(await getDriveStatus(ctx))
})

/**
 * DELETE /api/v1/settings/google — forget the stored Google token.
 *
 * This does not delete anything from Google Drive and does not remove a single
 * document record. It only means this application can no longer reach Drive
 * until an administrator connects it again.
 */
export const DELETE = withAuth(async ({ request, ctx }) => {
  await disconnectDrive(ctx, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })
  return jsonOk({ disconnected: true })
})
