import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { copySessionStructure } from '@/server/services/academic-structure.service'
import { copyStructureSchema } from '@/validation/academics'

/** "Copy structure from previous session" — the new-academic-year shortcut. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, copyStructureSchema)
  return jsonOk(await copySessionStructure(ctx, input))
})
