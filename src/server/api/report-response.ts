import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { requireAuthContext, type AuthContext } from '../auth/context'
import { ValidationError } from './errors'
import { errorResponse, jsonOk, zodFieldErrors } from './handler'
import { csvFileName, toCsv, type CsvColumn } from '../reports/csv'

/**
 * One route, two renderings.
 *
 * A report route parses the same query for both formats, calls the same
 * service function, and then either returns the data as JSON for the screen
 * or writes the CSV columns from the same rows. That is how "exports match
 * on-screen data" is kept true by construction rather than by care.
 *
 * The CSV is a download, never cached, and never inlined -- the same headers
 * a document download uses.
 */
export interface ReportDefinition<Q, Out, Row> {
  schema: z.ZodType<Q>
  load: (ctx: AuthContext, query: Q) => Promise<Out>
  /** Flattens the loaded report into the rows the CSV should carry. */
  rows: (out: Out) => Row[]
  columns: (out: Out, query: Q) => CsvColumn<Row>[]
  fileName: (out: Out, query: Q) => (string | null | undefined)[]
}

export function reportRoute<Q extends { format: 'json' | 'csv' }, Out, Row>(definition: ReportDefinition<Q, Out, Row>) {
  return async (request: NextRequest) => {
    const requestInfo = { method: request.method, path: new URL(request.url).pathname }
    try {
      const ctx = await requireAuthContext()
      const params = Object.fromEntries(new URL(request.url).searchParams)
      const parsed = definition.schema.safeParse(params)
      if (!parsed.success) {
        throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
      }
      const query = parsed.data
      const out = await definition.load(ctx, query)

      if (query.format !== 'csv') return jsonOk(out)

      const text = toCsv(definition.rows(out), definition.columns(out, query))
      const name = csvFileName(definition.fileName(out, query))
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      return errorResponse(error, requestInfo)
    }
  }
}
