import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { logout } from '@/server/services/auth.service'
import { clearSessionCookie } from '@/server/auth/session'

export const POST = withAuth(async ({ request, ctx }) => {
  await logout(ctx, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  await clearSessionCookie()

  return jsonOk({ signedOut: true })
})
