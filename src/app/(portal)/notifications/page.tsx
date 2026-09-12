import type { Metadata } from 'next'
import { requirePortalAccess } from '@/server/auth/context'
import { listNotifications } from '@/server/services/notifications.service'
import { notificationListQuerySchema } from '@/validation/notifications'
import { PageHeader } from '@/components/layout/app-shell'
import { NotificationList } from '@/features/notifications/notification-list'

export const metadata: Metadata = { title: 'Notifications' }
export const dynamic = 'force-dynamic'

/**
 * Everybody's own notifications, in one place. Whichever portal they are in:
 * a notification belongs to a person, not to a role.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePortalAccess(['ADMIN', 'STAFF', 'STUDENT'])
  const params = await searchParams
  const parsed = notificationListQuerySchema.safeParse(params)
  const page = await listNotifications(ctx, parsed.success ? parsed.data : notificationListQuerySchema.parse({}))

  return (
    <>
      <PageHeader title="Notifications" description="Everything the school has told you, newest first." />
      <NotificationList page={page} />
    </>
  )
}
