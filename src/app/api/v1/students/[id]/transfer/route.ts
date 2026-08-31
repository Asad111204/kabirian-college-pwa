import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { transferStudent } from '@/server/services/students.service'
import { studentTransferSchema } from '@/validation/students'

/**
 * Move a student to another section, program or division inside the SAME
 * academic session.
 *
 * The old enrollment row is closed as TRANSFERRED and a new one opened, so the
 * previous placement stays in the student's history.
 */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, studentTransferSchema)
  return jsonOk(await transferStudent(ctx, params.id!, input))
})
