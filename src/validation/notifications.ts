import { z } from 'zod'
import { NOTIFICATION_KINDS } from '@/server/notifications/notifications-policy'

/** Notifications (Phase 27): a person's own list, and marking it read. */
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS)

const optionalEnum = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === 'ALL' ? undefined : v), schema.optional())

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  kind: optionalEnum(notificationKindSchema),
  unreadOnly: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
})

/** Marking everything read, optionally only in one part of the college. */
export const notificationReadAllSchema = z.object({
  kind: optionalEnum(notificationKindSchema),
})

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>
export type NotificationReadAllInput = z.infer<typeof notificationReadAllSchema>
