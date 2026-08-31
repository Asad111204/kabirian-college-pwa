import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { linkStudentAccount, unlinkStudentAccount } from '@/server/services/students.service'
import { studentAccountSchema } from '@/validation/students'

/**
 * Link a student portal login to this record — either an existing STUDENT
 * account, or a new one created here. A new account's temporary password is in
 * the response once and is never stored in readable form.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentAccountSchema)
  return jsonOk(await linkStudentAccount(ctx, params.id!, input))
})

/** Disconnect the login. The user account itself is kept, not deleted. */
export const DELETE = withAuth(async ({ ctx, params }) =>
  jsonOk(await unlinkStudentAccount(ctx, params.id!)),
)
