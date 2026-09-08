import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getStudentFeePlan, setStudentFeePlan } from '@/server/services/fees.service'
import { studentFeePlanSchema } from '@/validation/fees'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid student.')
  return parsed.data
}

/** GET /api/v1/students/:id/fee-plan — the package and concession they are on. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getStudentFeePlan(ctx, idOf(params.id))))

/** PUT /api/v1/students/:id/fee-plan — put them on a package, with a concession. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentFeePlanSchema)
  return jsonOk(await setStudentFeePlan(ctx, idOf(params.id), input))
})
