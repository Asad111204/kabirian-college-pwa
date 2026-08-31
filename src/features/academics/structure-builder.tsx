'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Layers, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api-client'

interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}
interface ClassOption {
  id: string
  name: string
  displayName: string | null
  level: number
}
interface DivisionOption {
  id: string
  name: string
}
interface ProgramOption {
  id: string
  name: string
  code: string
}

export interface GroupRow {
  id: string
  isActive: boolean
  classId: string
  className: string
  classDisplayName: string | null
  divisionId: string
  divisionName: string
  programId: string
  programName: string
  programCode: string
  sections: { id: string; name: string; isActive: boolean; capacity: number | null; studentCount: number }[]
}

export function StructureBuilder({
  sessions,
  selectedSessionId,
  classes,
  divisions,
  programs,
  groups,
}: {
  sessions: SessionOption[]
  selectedSessionId: string
  classes: ClassOption[]
  divisions: DivisionOption[]
  programs: ProgramOption[]
  groups: GroupRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [sectionDialog, setSectionDialog] = React.useState<GroupRow | null>(null)
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false)

  /** Quick lookup: does this class+division+program combination already exist? */
  const groupByKey = React.useMemo(() => {
    const map = new Map<string, GroupRow>()
    for (const group of groups) {
      map.set(`${group.classId}:${group.divisionId}:${group.programId}`, group)
    }
    return map
  }, [groups])

  const totalSections = groups.reduce((sum, g) => sum + g.sections.length, 0)
  const totalStudents = groups.reduce(
    (sum, g) => sum + g.sections.reduce((s, sec) => s + sec.studentCount, 0),
    0,
  )

  function switchSession(sessionId: string) {
    router.push(`/admin/academics/structure?session=${sessionId}`)
  }

  async function toggleCombination(classId: string, divisionId: string, program: ProgramOption) {
    const key = `${classId}:${divisionId}:${program.id}`
    const existing = groupByKey.get(key)

    setBusy(true)
    try {
      if (existing) {
        await api.delete(`/api/v1/academics/groups/${existing.id}`)
        toast.success('Combination removed.')
      } else {
        await api.post('/api/v1/academics/groups', {
          academicSessionId: selectedSessionId,
          classId,
          divisionId,
          programId: program.id,
          initialSectionName: 'A',
        })
        toast.success('Combination created with Section A.')
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the structure.')
    } finally {
      setBusy(false)
    }
  }

  /** Creates every missing combination for the session in one request. */
  async function createAll() {
    const combinations: { classId: string; divisionId: string; programId: string }[] = []
    for (const klass of classes) {
      for (const division of divisions) {
        for (const program of programs) {
          combinations.push({ classId: klass.id, divisionId: division.id, programId: program.id })
        }
      }
    }

    setBusy(true)
    try {
      const result = await api.post<{ created: number; skipped: number }>(
        '/api/v1/academics/groups/bulk',
        { academicSessionId: selectedSessionId, combinations, initialSectionName: 'A' },
      )
      toast.success(
        result.created > 0
          ? `Created ${result.created} combination${result.created === 1 ? '' : 's'}.`
          : 'Every combination already exists.',
      )
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the structure.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Session picker + summary */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <Field label="Academic session" htmlFor="sessionPicker" className="min-w-52">
            <Select
              id="sessionPicker"
              value={selectedSessionId}
              onChange={(e) => switchSession(e.target.value)}
              disabled={busy}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-1 flex-wrap items-center gap-4 text-sm">
            <Stat icon={Layers} label="Groups" value={groups.length} />
            <Stat icon={Layers} label="Sections" value={totalSections} />
            <Stat icon={Users} label="Students" value={totalStudents} />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCopyDialogOpen(true)} disabled={busy}>
              <Copy className="h-4 w-4" />
              Copy from session
            </Button>
            <Button size="sm" onClick={createAll} loading={busy}>
              <Plus className="h-4 w-4" />
              Create all combinations
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The matrix: one table per class, rows = divisions, columns = programs */}
      {classes.map((klass) => (
        <Card key={klass.id}>
          <CardHeader>
            <CardTitle>{klass.displayName ?? klass.name}</CardTitle>
            <Badge variant="neutral">Level {klass.level}</Badge>
          </CardHeader>

          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    Division
                  </th>
                  {programs.map((program) => (
                    <th
                      key={program.id}
                      className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-foreground-muted"
                    >
                      {program.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {divisions.map((division) => (
                  <tr key={division.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{division.name}</td>

                    {programs.map((program) => {
                      const group = groupByKey.get(`${klass.id}:${division.id}:${program.id}`)
                      const students = group
                        ? group.sections.reduce((sum, s) => sum + s.studentCount, 0)
                        : 0

                      return (
                        <td key={program.id} className="px-3 py-2 text-center">
                          {group ? (
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setSectionDialog(group)}
                                className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 hover:bg-success-50/80"
                                title="Manage sections"
                              >
                                <Check className="h-3 w-3" />
                                {group.sections.length} section
                                {group.sections.length === 1 ? '' : 's'}
                              </button>
                              {students > 0 ? (
                                <span className="text-[11px] text-foreground-muted">
                                  {students} student{students === 1 ? '' : 's'}
                                </span>
                              ) : (
                                <button
                                  onClick={() => toggleCombination(klass.id, division.id, program)}
                                  disabled={busy}
                                  className="text-[11px] text-danger-600 hover:underline disabled:opacity-50"
                                >
                                  remove
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleCombination(klass.id, division.id, program)}
                              disabled={busy}
                              className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs text-foreground-muted hover:border-primary hover:text-primary disabled:opacity-50"
                              aria-label={`Create ${klass.name} ${division.name} ${program.name}`}
                            >
                              + add
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {sectionDialog ? (
        <SectionsDialog
          group={sectionDialog}
          onClose={() => setSectionDialog(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      <CopyStructureDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        sessions={sessions}
        targetSessionId={selectedSessionId}
        onCopied={() => router.refresh()}
      />
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-1.5 text-foreground-muted">
      <Icon className="h-4 w-4" />
      <span className="font-semibold text-foreground">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sections of one group                                                      */
/* -------------------------------------------------------------------------- */

function SectionsDialog({
  group,
  onClose,
  onChanged,
}: {
  group: GroupRow
  onClose: () => void
  onChanged: () => void
}) {
  const [newName, setNewName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function addSection(event: React.FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return

    setBusy(true)
    setError(null)
    try {
      await api.post('/api/v1/academics/sections', {
        academicGroupId: group.id,
        name: newName.trim().toUpperCase(),
        isActive: true,
      })
      toast.success(`Section ${newName.trim().toUpperCase()} added.`)
      setNewName('')
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the section.')
    } finally {
      setBusy(false)
    }
  }

  async function removeSection(sectionId: string, name: string) {
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/api/v1/academics/sections/${sectionId}`)
      toast.success(`Section ${name} removed.`)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the section.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Sections"
        description={`${group.classDisplayName ?? group.className} · ${group.divisionName} · ${group.programName}`}
      >
        {error ? (
          <Alert variant="warning" className="mb-3">
            {error}
          </Alert>
        ) : null}

        <ul className="mb-4 space-y-2">
          {group.sections.map((section) => (
            <li
              key={section.id}
              className="flex items-center justify-between rounded-[var(--radius-control)] border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">Section {section.name}</p>
                <p className="text-xs text-foreground-muted">
                  {section.studentCount} student{section.studentCount === 1 ? '' : 's'}
                  {section.capacity ? ` · capacity ${section.capacity}` : ''}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-danger-600 hover:bg-danger-50"
                disabled={busy || section.studentCount > 0}
                title={
                  section.studentCount > 0
                    ? 'Sections with students cannot be removed'
                    : 'Remove this section'
                }
                onClick={() => removeSection(section.id, section.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={addSection} className="flex items-end gap-2">
          <Field label="New section" htmlFor="sectionName" className="flex-1">
            <Input
              id="sectionName"
              value={newName}
              onChange={(e) => setNewName(e.target.value.toUpperCase())}
              placeholder="e.g. B"
              maxLength={20}
              disabled={busy}
            />
          </Field>
          <Button type="submit" loading={busy} disabled={!newName.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Copy a whole structure from another session                                */
/* -------------------------------------------------------------------------- */

function CopyStructureDialog({
  open,
  onOpenChange,
  sessions,
  targetSessionId,
  onCopied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessions: SessionOption[]
  targetSessionId: string
  onCopied: () => void
}) {
  const others = sessions.filter((s) => s.id !== targetSessionId)
  const [fromSessionId, setFromSessionId] = React.useState(others[0]?.id ?? '')
  const [includeCurriculum, setIncludeCurriculum] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleCopy(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<{
        groupsCreated: number
        sectionsCreated: number
        curriculumCreated: number
      }>('/api/v1/academics/groups/copy', {
        fromSessionId,
        toSessionId: targetSessionId,
        includeCurriculum,
      })
      toast.success(
        `Copied ${result.groupsCreated} group(s), ${result.sectionsCreated} section(s)` +
          (includeCurriculum ? ` and ${result.curriculumCreated} curriculum entries.` : '.'),
      )
      onOpenChange(false)
      onCopied()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not copy the structure.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Copy structure from another session"
        description="Recreates the same classes, divisions, programs and sections in this session. Existing combinations are left untouched."
      >
        {others.length === 0 ? (
          <Alert variant="info">There is no other session to copy from yet.</Alert>
        ) : (
          <form onSubmit={handleCopy} className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Field label="Copy from" htmlFor="fromSession" required>
              <Select
                id="fromSession"
                value={fromSessionId}
                onChange={(e) => setFromSessionId(e.target.value)}
                disabled={busy}
              >
                {others.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCurriculum}
                onChange={(e) => setIncludeCurriculum(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]"
                disabled={busy}
              />
              Also copy the curriculum (which subjects each program studies)
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!fromSessionId}>
                Copy structure
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
