'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, RotateCcw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api-client'
import { ROLE_LABEL } from './shared'
import type { UserRole } from '@/generated/prisma/enums'

export interface PermissionItem {
  key: string
  description: string
  /** The role grants this by default. */
  fromRole: boolean
  /** An explicit exception for this one person. */
  override: 'GRANT' | 'REVOKE' | null
  /** What the person can actually do = role + grants − revokes. */
  effective: boolean
}

export interface PermissionModule {
  module: string
  permissions: PermissionItem[]
}

const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  academics: 'Academic structure',
  students: 'Students',
  staff: 'Staff',
  attendance: 'Attendance',
  exams: 'Exams',
  marks: 'Marks',
  results: 'Results',
  timetable: 'Timetable',
  notices: 'Notices',
  events: 'Events',
  documents: 'Documents',
  reports: 'Reports',
  users: 'Users & accounts',
  system: 'System',
}

/**
 * Individual permission overrides for one user.
 *
 * Three states per permission, which the UI keeps visually distinct:
 *   - Default  — follow the role (no override stored)
 *   - Allow    — GRANT, an exception that adds a permission the role lacks
 *   - Deny     — REVOKE, an exception that removes one the role has
 *
 * The "effective" column always shows the end result, so an administrator never
 * has to work it out in their head.
 */
export function PermissionsEditor({
  userId,
  userName,
  role,
  modules,
  canEdit,
}: {
  userId: string
  userName: string
  role: UserRole
  modules: PermissionModule[]
  canEdit: boolean
}) {
  const router = useRouter()

  /** Only the exceptions are tracked; everything else follows the role. */
  const initialOverrides = React.useMemo(() => {
    const map = new Map<string, 'GRANT' | 'REVOKE'>()
    for (const group of modules) {
      for (const permission of group.permissions) {
        if (permission.override) map.set(permission.key, permission.override)
      }
    }
    return map
  }, [modules])

  const [overrides, setOverrides] = React.useState(initialOverrides)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const dirty = React.useMemo(() => {
    if (overrides.size !== initialOverrides.size) return true
    for (const [key, value] of overrides) {
      if (initialOverrides.get(key) !== value) return true
    }
    return false
  }, [overrides, initialOverrides])

  const overrideCount = overrides.size

  function setState(key: string, fromRole: boolean, next: 'default' | 'allow' | 'deny') {
    setOverrides((prev) => {
      const map = new Map(prev)

      if (next === 'default') {
        map.delete(key)
      } else if (next === 'allow') {
        // Allowing something the role already allows is not an exception,
        // so nothing is stored — it simply follows the role.
        if (fromRole) map.delete(key)
        else map.set(key, 'GRANT')
      } else {
        // Same in reverse: denying something the role never granted is a no-op.
        if (fromRole) map.set(key, 'REVOKE')
        else map.delete(key)
      }

      return map
    })
  }

  function effectiveFor(permission: PermissionItem): boolean {
    const override = overrides.get(permission.key)
    if (override === 'GRANT') return true
    if (override === 'REVOKE') return false
    return permission.fromRole
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/v1/users/${userId}/permissions`, {
        overrides: [...overrides.entries()].map(([permissionKey, effect]) => ({
          permissionKey,
          effect,
        })),
      })
      toast.success('Permissions updated.')
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the permissions.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Permissions</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {userName} inherits the {ROLE_LABEL[role]} permissions. Add exceptions here only where
            this person needs to differ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={overrideCount > 0 ? 'warning' : 'neutral'}>
            {overrideCount} exception{overrideCount === 1 ? '' : 's'}
          </Badge>
          {canEdit ? (
            <>
              {dirty ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOverrides(initialOverrides)}
                  disabled={saving}
                >
                  <RotateCcw className="h-4 w-4" />
                  Undo
                </Button>
              ) : null}
              <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? <Alert variant="danger">{error}</Alert> : null}

        {!canEdit ? (
          <Alert variant="info">
            You can view these permissions but not change them. Changing them needs the
            &ldquo;Grant or revoke individual permissions&rdquo; permission.
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-4 text-xs text-foreground-muted">
          <LegendItem swatch="bg-surface-muted" label="Default — follows the role" />
          <LegendItem swatch="bg-success-50" label="Allow — added for this person" />
          <LegendItem swatch="bg-danger-50" label="Deny — removed for this person" />
        </div>

        {modules.map((group) => (
          <section key={group.module}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {MODULE_LABEL[group.module] ?? group.module}
            </h3>

            <ul className="space-y-1.5">
              {group.permissions.map((permission) => {
                const override = overrides.get(permission.key) ?? null
                const state = override === 'GRANT' ? 'allow' : override === 'REVOKE' ? 'deny' : 'default'
                const effective = effectiveFor(permission)

                return (
                  <li
                    key={permission.key}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-2.5 ${
                      state === 'allow'
                        ? 'border-success-600/40 bg-success-50'
                        : state === 'deny'
                          ? 'border-danger-600/40 bg-danger-50'
                          : 'border-border'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{permission.description}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <code className="text-[11px] text-foreground-muted">{permission.key}</code>
                        <span className="text-[11px] text-foreground-subtle">
                          role default: {permission.fromRole ? 'allowed' : 'not allowed'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <EffectiveMark allowed={effective} />

                      <div
                        className="flex overflow-hidden rounded-[var(--radius-control)] border border-border-strong"
                        role="group"
                        aria-label={`Permission setting for ${permission.description}`}
                      >
                        <StateButton
                          active={state === 'default'}
                          disabled={!canEdit || saving}
                          onClick={() => setState(permission.key, permission.fromRole, 'default')}
                          title="Follow the role"
                        >
                          <Minus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Default</span>
                        </StateButton>
                        <StateButton
                          active={state === 'allow'}
                          activeClass="bg-success-600 text-white"
                          disabled={!canEdit || saving}
                          onClick={() => setState(permission.key, permission.fromRole, 'allow')}
                          title="Allow for this person"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Allow</span>
                        </StateButton>
                        <StateButton
                          active={state === 'deny'}
                          activeClass="bg-danger-600 text-white"
                          disabled={!canEdit || saving}
                          onClick={() => setState(permission.key, permission.fromRole, 'deny')}
                          title="Deny for this person"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Deny</span>
                        </StateButton>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {dirty ? <Alert variant="warning">You have unsaved permission changes.</Alert> : null}
      </CardContent>
    </Card>
  )
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border border-border ${swatch}`} aria-hidden />
      {label}
    </span>
  )
}

function EffectiveMark({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        allowed ? 'text-success-700' : 'text-foreground-subtle'
      }`}
      title={allowed ? 'This person can do this' : 'This person cannot do this'}
    >
      {allowed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      <span className="hidden md:inline">{allowed ? 'Can' : 'Cannot'}</span>
    </span>
  )
}

function StateButton({
  active,
  activeClass = 'bg-primary text-primary-foreground',
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean
  activeClass?: string
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? activeClass : 'bg-surface text-foreground-muted hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  )
}
