import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { switchPortal } from '@/server/services/auth.service'
import { portalSwitchSchema } from '@/validation/auth'

/** POST /api/v1/auth/switch-portal — move this device to the other portal. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, portalSwitchSchema)
  return jsonOk(
    await switchPortal(ctx, input.role, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }),
  )
})
