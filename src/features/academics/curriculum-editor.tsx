'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api-client'

interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}

export interface CurriculumPair {
  classId: string
  className: string
  classLevel: number
  programId: string
  programName: string
  subjectCount: number
}

interface SubjectOption {
  id: string
  name: string
  code: string | null
}

export function CurriculumEditor({
  sessions,
  selectedSessionId,
  pairs,
  selectedPair,
  selectedSubjectIds,
  allSubjects,
}: {
  sessions: SessionOption[]
  selectedSessionId: string
  pairs: CurriculumPair[]
  selectedPair: CurriculumPair | null
  selectedSubjectIds: string[]
  allSubjects: SubjectOption[]
}) {
  const router = useRouter()
  /**
   * Starts from the subjects this class+program already has.
   *
   * When the admin switches to a different class+program, the page gives this
   * component a new `key` (see the page), so React creates a fresh component
   * with the new starting selection — no effect needed to re-synchronise.
   */
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set(selectedSubjectIds))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const dirty = React.useMemo(() => {
    const original = new Set(selectedSubjectIds)
    if (original.size !== checked.size) return true
    for (const id of checked) if (!original.has(id)) return true
    return false
  }, [checked, selectedSubjectIds])

  function navigate(next: { session?: string; classId?: string; programId?: string }) {
    const sessionId = next.session ?? selectedSessionId
    const classId = next.classId ?? selectedPair?.classId
    const programId = next.programId ?? selectedPair?.programId
    const search = new URLSearchParams({ session: sessionId })
    if (classId) search.set('class', classId)
    if (programId) search.set('program', programId)
    router.push(`/admin/academics/curriculum?${search.toString()}`)
  }

  async function handleSave() {
    if (!selectedPair) return
    setSaving(true)
    setError(null)

    try {
      const result = await api.put<{ added: number; removed: number; total: number }>(
        '/api/v1/academics/curriculum',
        {
          academicSessionId: selectedSessionId,
          classId: selectedPair.classId,
          programId: selectedPair.programId,
          subjects: [...checked].map((subjectId) => ({ subjectId, isCompulsory: true })),
        },
      )
      toast.success(
        `Saved: ${result.total} subject${result.total === 1 ? '' : 's'}` +
          (result.added || result.removed ? ` (+${result.added} / −${result.removed}).` : '.'),
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the curriculum.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Academic session" htmlFor="sessionPicker">
            <Select
              id="sessionPicker"
              value={selectedSessionId}
              onChange={(e) => navigate({ session: e.target.value })}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Class and program" htmlFor="pairPicker" className="sm:col-span-2">
            <Select
              id="pairPicker"
              value={selectedPair ? `${selectedPair.classId}:${selectedPair.programId}` : ''}
              onChange={(e) => {
                const [classId, programId] = e.target.value.split(':')
                navigate({ classId, programId })
              }}
            >
              {pairs.map((pair) => (
                <option key={`${pair.classId}:${pair.programId}`} value={`${pair.classId}:${pair.programId}`}>
                  {pair.className} · {pair.programName} ({pair.subjectCount} subject
                  {pair.subjectCount === 1 ? '' : 's'})
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {selectedPair ? (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>
                {selectedPair.className} · {selectedPair.programName}
              </CardTitle>
              <p className="mt-0.5 text-sm text-foreground-muted">
                Applies to every division and every section of this program.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={checked.size > 0 ? 'brand' : 'neutral'}>
                {checked.size} selected
              </Badge>
              <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {error ? (
              <Alert variant="danger" className="mb-4">
                {error}
              </Alert>
            ) : null}

            {allSubjects.length === 0 ? (
              <EmptyState
                title="No subjects exist yet"
                description="Add subjects to the master list first."
                action={
                  <Button size="sm" asChild>
                    <Link href="/admin/academics/subjects">Go to Subjects</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allSubjects.map((subject) => {
                    const isChecked = checked.has(subject.id)
                    return (
                      <label
                        key={subject.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-3 py-2 text-sm transition-colors ${
                          isChecked
                            ? 'border-primary bg-brand-50 text-brand-900'
                            : 'border-border hover:border-border-strong'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setChecked((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(subject.id)
                              else next.delete(subject.id)
                              return next
                            })
                          }}
                          className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                        {subject.code ? (
                          <code className="shrink-0 text-xs opacity-70">{subject.code}</code>
                        ) : null}
                      </label>
                    )
                  })}
                </div>

                {dirty ? (
                  <Alert variant="warning" className="mt-4">
                    You have unsaved changes.
                  </Alert>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
