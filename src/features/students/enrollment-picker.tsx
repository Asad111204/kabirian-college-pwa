'use client'

import * as React from 'react'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'

export interface EnrollmentValue {
  academicSessionId: string
  classId: string
  divisionId: string
  programId: string
  sectionId: string
  rollNumber: string
}

export const EMPTY_ENROLLMENT: EnrollmentValue = {
  academicSessionId: '',
  classId: '',
  divisionId: '',
  programId: '',
  sectionId: '',
  rollNumber: '',
}

export interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}

/**
 * The academic placement picker: Session → Class → Division → Program → Section.
 *
 * Each dropdown only offers combinations that actually exist in the chosen
 * session, narrowed by what has already been picked. All of it comes from the
 * `groups` list loaded from the database, so a program the administrator
 * created five minutes ago appears here with no code change — and impossible
 * combinations are never offered.
 */
export function EnrollmentPicker({
  sessions,
  groups,
  value,
  onChange,
  loading,
  disabled,
  errors,
  showRollNumber = true,
  lockSession,
}: {
  sessions: SessionOption[]
  groups: EnrollmentOptionGroup[]
  value: EnrollmentValue
  onChange: (next: EnrollmentValue) => void
  loading?: boolean
  disabled?: boolean
  errors?: Record<string, string[]>
  showRollNumber?: boolean
  /** Used by Transfer, where the session must stay the same. */
  lockSession?: boolean
}) {
  /** Distinct classes that have at least one group in this session. */
  const classes = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; level: number }>()
    for (const group of groups) {
      if (!seen.has(group.classId)) {
        seen.set(group.classId, { id: group.classId, name: group.className, level: group.classLevel })
      }
    }
    return [...seen.values()]
  }, [groups])

  /** Divisions available for the chosen class. */
  const divisions = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const group of groups) {
      if (group.classId !== value.classId) continue
      if (!seen.has(group.divisionId)) {
        seen.set(group.divisionId, { id: group.divisionId, name: group.divisionName })
      }
    }
    return [...seen.values()]
  }, [groups, value.classId])

  /** Programs configured for that class and division. */
  const programs = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const group of groups) {
      if (group.classId !== value.classId || group.divisionId !== value.divisionId) continue
      if (!seen.has(group.programId)) {
        seen.set(group.programId, { id: group.programId, name: group.programName })
      }
    }
    return [...seen.values()]
  }, [groups, value.classId, value.divisionId])

  /** Sections of the exact combination chosen. */
  const sections = React.useMemo(() => {
    const group = groups.find(
      (g) =>
        g.classId === value.classId &&
        g.divisionId === value.divisionId &&
        g.programId === value.programId,
    )
    return group?.sections ?? []
  }, [groups, value.classId, value.divisionId, value.programId])

  /** Changing a level clears everything below it, so no stale combination survives. */
  function update(changes: Partial<EnrollmentValue>) {
    const next = { ...value, ...changes }
    if (changes.academicSessionId !== undefined) {
      next.classId = ''
      next.divisionId = ''
      next.programId = ''
      next.sectionId = ''
    }
    if (changes.classId !== undefined) {
      next.divisionId = ''
      next.programId = ''
      next.sectionId = ''
    }
    if (changes.divisionId !== undefined) {
      next.programId = ''
      next.sectionId = ''
    }
    if (changes.programId !== undefined) {
      next.sectionId = ''
    }
    onChange(next)
  }

  const noStructure = !loading && value.academicSessionId !== '' && groups.length === 0

  return (
    <div className="space-y-4">
      {noStructure ? (
        <Alert variant="warning" title="This session has no academic structure">
          Build the class, division and program combinations for this session before enrolling
          students.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Academic session" htmlFor="academicSessionId" required error={errors?.academicSessionId}>
          <Select
            id="academicSessionId"
            value={value.academicSessionId}
            onChange={(e) => update({ academicSessionId: e.target.value })}
            disabled={disabled || lockSession}
          >
            <option value="">Select a session…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
                {session.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Class / Year"
          htmlFor="classId"
          required
          error={errors?.classId}
          hint={loading ? 'Loading the structure…' : undefined}
        >
          <Select
            id="classId"
            value={value.classId}
            onChange={(e) => update({ classId: e.target.value })}
            disabled={disabled || loading || classes.length === 0}
          >
            <option value="">Select a class…</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Division" htmlFor="divisionId" required error={errors?.divisionId}>
          <Select
            id="divisionId"
            value={value.divisionId}
            onChange={(e) => update({ divisionId: e.target.value })}
            disabled={disabled || !value.classId}
          >
            <option value="">{value.classId ? 'Select a division…' : 'Choose a class first'}</option>
            {divisions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Program / Group" htmlFor="programId" required error={errors?.programId}>
          <Select
            id="programId"
            value={value.programId}
            onChange={(e) => update({ programId: e.target.value })}
            disabled={disabled || !value.divisionId}
          >
            <option value="">
              {value.divisionId ? 'Select a program…' : 'Choose a division first'}
            </option>
            {programs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Section" htmlFor="sectionId" required error={errors?.sectionId}>
          <Select
            id="sectionId"
            value={value.sectionId}
            onChange={(e) => update({ sectionId: e.target.value })}
            disabled={disabled || !value.programId}
          >
            <option value="">{value.programId ? 'Select a section…' : 'Choose a program first'}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                Section {section.name}
                {section.capacity
                  ? ` — ${section.studentCount}/${section.capacity} students`
                  : ` — ${section.studentCount} student${section.studentCount === 1 ? '' : 's'}`}
              </option>
            ))}
          </Select>
        </Field>

        {showRollNumber ? (
          <Field
            label="Roll number"
            htmlFor="rollNumber"
            hint="Optional. Must be unique within the section."
            error={errors?.rollNumber}
          >
            <Input
              id="rollNumber"
              value={value.rollNumber}
              onChange={(e) => onChange({ ...value, rollNumber: e.target.value })}
              placeholder="e.g. 101"
              disabled={disabled || !value.sectionId}
            />
          </Field>
        ) : null}
      </div>

      {value.sectionId ? <PlacementSummary groups={groups} value={value} sessions={sessions} /> : null}
    </div>
  )
}

/** Confirms in words exactly where the student will be placed. */
function PlacementSummary({
  groups,
  value,
  sessions,
}: {
  groups: EnrollmentOptionGroup[]
  value: EnrollmentValue
  sessions: SessionOption[]
}) {
  const group = groups.find(
    (g) =>
      g.classId === value.classId &&
      g.divisionId === value.divisionId &&
      g.programId === value.programId,
  )
  const section = group?.sections.find((s) => s.id === value.sectionId)
  const session = sessions.find((s) => s.id === value.academicSessionId)
  if (!group || !section || !session) return null

  return (
    <div className="rounded-[var(--radius-control)] border border-border bg-surface-muted p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Placement</p>
      <p className="mt-1 font-medium text-foreground">
        {session.name} · {group.className} · {group.divisionName} · {group.programName} · Section{' '}
        {section.name}
        {value.rollNumber ? ` · Roll ${value.rollNumber}` : ''}
      </p>
    </div>
  )
}

/**
 * Loads the academic structure for a session. Shared by every screen that enrols.
 *
 * The fetched data is stored together with the session it belongs to. Whether we
 * are loading, and whether the data is usable, are then DERIVED from comparing
 * that with the session currently selected — so switching sessions never shows
 * the previous one's options, and no state has to be cleared in an effect.
 */
export function useEnrollmentOptions(sessionId: string) {
  const [loaded, setLoaded] = React.useState<{
    sessionId: string
    groups: EnrollmentOptionGroup[]
  } | null>(null)

  React.useEffect(() => {
    if (!sessionId) return

    let cancelled = false

    fetch(`/api/v1/students/enrollment-options?sessionId=${sessionId}`, {
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { data: EnrollmentOptionGroup[] }) => {
        if (!cancelled) setLoaded({ sessionId, groups: payload.data })
      })
      .catch(() => {
        // An empty structure is the honest fallback; the picker then says so.
        if (!cancelled) setLoaded({ sessionId, groups: [] })
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const isCurrent = loaded?.sessionId === sessionId

  // Memoised so consumers that derive lists from `groups` are not recomputing
  // on every render because of a fresh empty array.
  const groups = React.useMemo<EnrollmentOptionGroup[]>(
    () => (isCurrent && loaded ? loaded.groups : []),
    [isCurrent, loaded],
  )

  return { groups, loading: Boolean(sessionId) && !isCurrent }
}
