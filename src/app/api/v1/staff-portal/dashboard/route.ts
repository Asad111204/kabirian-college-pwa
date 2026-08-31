import { jsonOk, withAuth } from '@/server/api/handler'
import { getStaffDashboard } from '@/server/services/staff-portal.service'

/** The signed-in teacher's own figures. Staff accounts only. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await getStaffDashboard(ctx)))
