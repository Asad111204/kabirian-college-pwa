/**
 * Validation building blocks shared by the browser and the server.
 *
 * The SAME schema runs in both places: in the form for instant feedback, and in
 * the API route as the real check. The browser copy is a convenience; the server
 * copy is the security boundary (requirement 40).
 */
import { z } from 'zod'

/** Trims a string, and turns "" into undefined so optional fields stay empty. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional()

export const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `Use at most ${max} characters.`)

export const uuid = z.uuid('That is not a valid identifier.')

/**
 * A code such as PM, ICS-PHY, FAIT, 11.
 * Letters, digits and hyphens only; stored and compared in upper case.
 */
export const entityCode = (max: number, label = 'Code') =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `Use at most ${max} characters.`)
    .regex(/^[A-Za-z0-9-]+$/, `${label} may contain letters, numbers and hyphens only.`)
    .transform((v) => v.toUpperCase())

/** Academic session names look like 2026-27. */
export const sessionName = z
  .string({ error: 'Session name is required.' })
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Use the format 2026-27.')

/** A calendar date sent by a form as "2026-08-01". */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')

/** Pakistani CNIC / B-Form: 12345-1234567-1 */
export const cnic = z
  .string()
  .trim()
  .regex(/^\d{5}-\d{7}-\d$/, 'Use the format 12345-1234567-1.')

/** Pakistani mobile number: 0300-1234567 or +923001234567 */
export const phone = z
  .string()
  .trim()
  .regex(/^(\+92\d{10}|0\d{3}-?\d{7})$/, 'Use the format 0300-1234567.')

/** Shared list query for paginated endpoints. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
})

export type ListQuery = z.infer<typeof listQuerySchema>
