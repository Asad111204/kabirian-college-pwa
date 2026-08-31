import { jsonOk, parseJsonBody, withPublic, clientIp } from '@/server/api/handler'
import { login } from '@/server/services/auth.service'
import { setSessionCookie } from '@/server/auth/session'
import { portalPathForRole } from '@/server/auth/context'
import { loginSchema } from '@/validation/auth'

export const POST = withPublic(async ({ request }) => {
  const input = await parseJsonBody(request, loginSchema)

  const result = await login(input, {
    ipAddress: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  })

  await setSessionCookie(result.token, result.expiresAt)

  return jsonOk({
    role: result.user.role,
    fullName: result.user.fullName,
    mustChangePassword: result.user.mustChangePassword,
    redirectTo: result.user.mustChangePassword
      ? '/change-password'
      : portalPathForRole(result.user.role),
  })
})
