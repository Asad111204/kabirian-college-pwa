import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { updateFeePackage } from '@/server/services/fees.service'
import { feePackageUpdateSchema } from '@/validation/fees'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid fee package.')
  return parsed.data
}

/** PUT /api/v1/fees/packages/:id — change the name, amount or whether it is in use. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, feePackageUpdateSchema)
  return jsonOk(await updateFeePackage(ctx, idOf(params.id), input))
})
