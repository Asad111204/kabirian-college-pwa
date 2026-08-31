import Link from 'next/link'
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ScrollText,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { QuickActionDefinition } from '@/server/services/dashboard-helpers'

const ICONS: Record<string, LucideIcon> = {
  'user-plus': UserPlus,
  users: Users,
  'users-round': UsersRound,
  layers: Layers,
  'graduation-cap': GraduationCap,
  'layout-dashboard': LayoutDashboard,
  'book-open': BookOpen,
  'scroll-text': ScrollText,
  'calendar-days': CalendarDays,
}

/**
 * Shortcuts to the screens this administrator is allowed to use.
 *
 * The list is filtered on the server against their effective permissions, so an
 * administrator who cannot manage users is never shown "Add user account".
 * Every destination is a page that exists today.
 */
export function QuickActions({ actions }: { actions: QuickActionDefinition[] }) {
  if (actions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {actions.map((action) => {
            const Icon = ICONS[action.icon] ?? LayoutDashboard
            return (
              <Link
                key={action.key}
                href={action.href}
                className={cn(
                  // min-h keeps every shortcut comfortably tappable on a phone.
                  'flex min-h-16 flex-col justify-center gap-1.5 rounded-[var(--radius-control)] border p-3 text-sm transition-colors',
                  action.primary
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
                    : 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-muted',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="leading-tight">{action.label}</span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
