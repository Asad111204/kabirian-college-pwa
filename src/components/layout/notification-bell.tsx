'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, CheckCheck } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { badgeCount, type UnreadByKind } from '@/server/notifications/notifications-policy'

export interface NotificationSummaryView {
  total: number
  byKind: UnreadByKind
  latest: { id: string; kind: string; kindLabel: string; title: string; body: string | null; link: string; read: boolean; createdAt: string }[]
}

/**
 * How often the app asks whether anything new has arrived.
 *
 * Sixty seconds, and only while the tab is actually being looked at. There is
 * no push service and no socket here — this college's deployment carries
 * neither — so this is a poll, and it is written to be a cheap one: two
 * indexed queries, and none at all while the tab is in the background.
 */
const POLL_MS = 60_000

const Context = React.createContext<{
  summary: NotificationSummaryView
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
} | null>(null)

/** Everything signed in shares one count, so the bell and the menu agree. */
export function NotificationProvider({ initial, children }: { initial: NotificationSummaryView; children: React.ReactNode }) {
  const [summary, setSummary] = React.useState(initial)
  const pathname = usePathname()

  const refresh = React.useCallback(async () => {
    try {
      setSummary(await api.get<NotificationSummaryView>('/api/v1/notifications/summary'))
    } catch {
      // A failed poll is not worth telling anybody about; the next one will do.
    }
  }, [])

  const markRead = React.useCallback(async (id: string) => {
    try {
      setSummary(await api.post<NotificationSummaryView>(`/api/v1/notifications/${id}/read`))
    } catch {
      /* the list will catch up on the next poll */
    }
  }, [])

  // Poll, but only while somebody is looking.
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), POLL_MS)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
        start()
      } else stop()
    }

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  /**
   * Opening a page clears that part of the college.
   *
   * The server is told which page, works out which kinds live under it, marks
   * those read and hands back the new counts — so the dot disappears from the
   * button that was just pressed and from nothing else.
   */
  React.useEffect(() => {
    let cancelled = false
    void api
      .post<NotificationSummaryView>('/api/v1/notifications/seen', { path: pathname })
      .then((next) => {
        if (!cancelled) setSummary(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pathname])

  // The number on the home-screen icon, where the platform supports one.
  React.useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    const count = badgeCount(summary.total)
    try {
      if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined)
      else void nav.clearAppBadge?.()?.catch(() => undefined)
    } catch {
      // Not every browser has the Badging API. Nothing else depends on it.
    }
  }, [summary.total])

  return <Context.Provider value={{ summary, refresh, markRead }}>{children}</Context.Provider>
}

export function useNotifications() {
  return React.useContext(Context)
}

/** The bell in the top bar, with what is unread behind it. */
export function NotificationBell() {
  const state = useNotifications()
  const router = useRouter()
  if (!state) return null

  const { summary, markRead } = state
  const count = badgeCount(summary.total)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={summary.total > 0 ? `Notifications: ${summary.total} unread` : 'Notifications'}
          className="relative rounded-[var(--radius-control)] p-2 text-foreground-muted hover:bg-surface-muted"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-danger-600 px-1 text-center text-[11px] font-semibold leading-[1.15rem] text-white">
              {count}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-card)] border border-border bg-surface p-1.5 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-2">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {summary.total > 0 ? (
              <button
                type="button"
                onClick={async () => {
                  await api.post('/api/v1/notifications/read-all', {})
                  await state.refresh()
                  router.refresh()
                }}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {summary.latest.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-foreground-muted">Nothing yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {summary.latest.map((item) => (
                <li key={item.id}>
                  <DropdownMenu.Item asChild>
                    <Link
                      href={item.link}
                      onClick={() => void markRead(item.id)}
                      className={cn(
                        'block cursor-pointer rounded-[var(--radius-control)] px-2 py-2 outline-none hover:bg-surface-muted',
                        item.read ? '' : 'bg-primary/5',
                      )}
                    >
                      <span className="flex items-start gap-2">
                        {item.read ? <span className="mt-1.5 h-2 w-2 shrink-0" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger-600" aria-hidden />}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                          {item.body ? <span className="block truncate text-xs text-foreground-muted">{item.body}</span> : null}
                          <span className="block text-[11px] text-foreground-subtle">{item.kindLabel}</span>
                        </span>
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                </li>
              ))}
            </ul>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link href="/notifications" className="block cursor-pointer rounded-[var(--radius-control)] px-2 py-2 text-center text-sm text-primary outline-none hover:bg-surface-muted">
              See all notifications
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
