import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { changeOwnPassword } from '@/server/services/auth.service'
import { createSession, setSessionCookie } from '@/server/auth/session'
import { changePasswordSchema } from '@/validation/auth'

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, changePasswordSchema)

  const requestInfo = {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  }

  await changeOwnPassword(ctx, input, requestInfo)

  // Changing the password signs out every device, including this one — so give
  // this browser a fresh session instead of dumping the user back on the login
  // screen straight after a successful change.
  const { token, expiresAt } = await createSession(ctx.userId, requestInfo)
  await setSessionCookie(token, expiresAt)

  return jsonOk({ changed: true })
})
