import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createFeePackage, listFeePackages } from '@/server/services/fees.service'
import { feePackageCreateSchema } from '@/validation/fees'

/** GET /api/v1/fees/packages — the college's fee packages. */
export const GET = withAuth(async ({ ctx }) => jsonOk(await listFeePackages(ctx)))

/** POST /api/v1/fees/packages — add one. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, feePackageCreateSchema)
  return jsonOk(await createFeePackage(ctx, input), 201)
})
