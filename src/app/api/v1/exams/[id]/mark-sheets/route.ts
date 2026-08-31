import { jsonOk, withAuth } from '@/server/api/handler'
import { listExamMarkSheets } from '@/server/services/marks.service'

/** Which papers have been marked and which have not. Status only, no marks. */
export const GET = withAuth(async ({ ctx, params }) =>
  jsonOk(await listExamMarkSheets(ctx, params.id!)),
)
