'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, Menu, X, KeyRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogoWordmark } from './logo'
import { NAVIGATION, PORTAL_LABELS, type NavSection } from './nav-config'
import type { UserRole } from '@/generated/prisma/enums'

export interface AppShellUser {
  fullName: string
  username: string
  role: UserRole
}

/**
 * The frame around every signed-in page: a fixed sidebar on desktop, a slide-in
 * drawer on phones, and a top bar with the user menu.
 */
export function AppShell({
  user,
  collegeName,
  sessionLabel,
  children,
}: {
  user: AppShellUser
  collegeName: string
  sessionLabel?: string | null
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const pathname = usePathname()
  const sections = NAVIGATION[user.role]

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <LogoWordmark collegeName={collegeName} subtitle={PORTAL_LABELS[user.role]} />
        </div>
        <SidebarNav sections={sections} pathname={pathname} />
        <SidebarFooter sessionLabel={sessionLabel} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-ink-950/50"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <LogoWordmark collegeName={collegeName} subtitle={PORTAL_LABELS[user.role]} />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded p-1.5 hover:bg-white/10"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Tapping a link closes the drawer — handled here rather than in an
                effect, so there is no extra render after every navigation. */}
            <SidebarNav
              sections={sections}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <SidebarFooter sessionLabel={sessionLabel} />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-[var(--radius-control)] p-2 text-foreground-muted hover:bg-surface-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            {sessionLabel ? (
              <span className="hidden text-xs text-foreground-muted sm:inline">
                Academic session <span className="font-medium text-foreground">{sessionLabel}</span>
              </span>
            ) : null}
          </div>

          <UserMenu user={user} />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  )
}

function SidebarNav({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.title}
            </p>
          ) : null}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/admin' &&
                  item.href !== '/staff' &&
                  item.href !== '/student' &&
                  pathname.startsWith(`${item.href}/`))

              if (item.comingSoon) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm text-sidebar-muted opacity-60"
                      title={`Arrives in Phase ${item.phase}`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide">
                        Phase {item.phase}
                      </span>
                    </span>
                  </li>
                )
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-sidebar-active font-medium text-white'
                        : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ sessionLabel }: { sessionLabel?: string | null }) {
  return (
    <div className="border-t border-white/10 px-4 py-3 text-xs text-sidebar-muted">
      {sessionLabel ? (
        <p>
          Session <span className="font-medium text-white">{sessionLabel}</span>
        </p>
      ) : (
        <p>No academic session set</p>
      )}
    </div>
  )
}

function UserMenu({ user }: { user: AppShellUser }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await api.post('/api/v1/auth/logout')
    } finally {
      // Even if the request failed, send them to the login page.
      router.replace('/login')
      router.refresh()
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm hover:bg-surface-muted">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.fullName)}
          </span>
          <span className="hidden max-w-32 truncate font-medium sm:inline">{user.fullName}</span>
          <ChevronDown className="h-4 w-4 text-foreground-muted" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-[var(--radius-card)] border border-border bg-surface p-1.5 shadow-lg"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium text-foreground">{user.fullName}</p>
            <p className="truncate text-xs text-foreground-muted">{user.username}</p>
            <Badge variant="brand" className="mt-1.5">
              {PORTAL_LABELS[user.role]}
            </Badge>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item asChild>
            <Link
              href="/change-password"
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 text-sm text-foreground outline-none hover:bg-surface-muted"
            >
              <KeyRound className="h-4 w-4" />
              Change password
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 text-sm text-danger-600 outline-none hover:bg-danger-50"
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}

/** Standard page heading used by every screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  )
}

export { Button }
