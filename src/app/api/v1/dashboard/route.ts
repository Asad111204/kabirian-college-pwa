import { jsonOk, withAuth } from '@/server/api/handler'
import { getAdminDashboard } from '@/server/services/dashboard.service'

/**
 * GET /api/v1/dashboard — the same figures the admin dashboard page renders.
 *
 * Administrators only: the service checks `dashboard.view` and then requires the
 * ADMIN role, so a staff member or student calling this directly gets 403 even
 * though they hold `dashboard.view` for their own portal.
 */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getAdminDashboard(ctx)))
