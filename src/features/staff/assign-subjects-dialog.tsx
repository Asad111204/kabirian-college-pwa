'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { SectionQuickSelect } from '@/features/academics/section-quick-select'
import type { AssignmentOptionGroup } from '@/server/services/staff.service'

/** What the server did with one save, so the office can see it plainly. */
interface AssignmentBulkResult {
  created: string[]
  alreadyHeld: string[]
  refused: string[]
}

export interface SessionOption {
  id: string
  name: string
  isCurrent: boolean
}

/**
 * Ticking sections and subjects rather than choosing one of each.
 *
 * A teacher who takes English takes it for most of the college, and walking a
 * cascade of five dropdowns for each of those was the slowest thing in the
 * office's week. Sections are listed under their class, division and program
 * all at once, because a teacher crossing several is the normal case, not the
 * exception.
 *
 * The subjects offered are the ones the chosen sections are actually taught.
 * Sections from two programs show the union of both curricula, and a pairing
 * that only one of them allows is skipped by the server and reported back,
 * rather than stopping every other pairing from being made.
 */
export function AssignSubjectsDialog({
  staffId,
  staffName,
  sessions,
  onClose,
}: {
  staffId: string
  staffName: string
  sessions: SessionOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [sessionId, setSessionId] = React.useState(sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? '')
  // Kept with the session it belongs to, so switching session shows
  // "loading" without having to blank it out from inside the effect.
  const [loaded, setLoaded] = React.useState<{ sessionId: string; groups: AssignmentOptionGroup[] } | null>(null)
  const [sectionIds, setSectionIds] = React.useState<string[]>([])
  /**
   * The subjects chosen for each section, kept separately.
   *
   * A teacher's subjects are not the same in every class — English and Urdu in
   * 1st Year Bio Boys, English alone in 1st Year Bio Girls where Urdu belongs
   * to somebody else — so this is a list per section rather than one list for
   * all of them. "Same as the first" fills the rest in one click, which is
   * still the common case.
   */
  const [subjectsBySection, setSubjectsBySection] = React.useState<Record<string, string[]>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<AssignmentBulkResult | null>(null)

  React.useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    fetch(`/api/v1/staff/assignment-options?sessionId=${sessionId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((payload: { data: AssignmentOptionGroup[] }) => {
        if (!cancelled) setLoaded({ sessionId, groups: payload.data })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ sessionId, groups: [] })
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const groups = loaded?.sessionId === sessionId ? loaded.groups : null

  /** Every section in the year, flattened, for the whole-year buttons. */
  const everySection = React.useMemo(
    () =>
      (groups ?? []).flatMap((group) =>
        group.sections.map((section) => ({
          id: section.id,
          className: group.className,
          divisionName: group.divisionName,
        })),
      ),
    [groups],
  )

  /** Every ticked section, in the order the college lists them, with its group. */
  const chosen = React.useMemo(() => {
    const rows: { section: { id: string; name: string }; group: AssignmentOptionGroup }[] = []
    for (const group of groups ?? []) {
      for (const section of group.sections) {
        if (sectionIds.includes(section.id)) rows.push({ section, group })
      }
    }
    return rows
  }, [groups, sectionIds])

  /** What one section may be given: its own curriculum, and nothing else. */
  const subjectsFor = (group: AssignmentOptionGroup) =>
    [...group.subjects].sort((a, b) => a.name.localeCompare(b.name))

  // A section that has been unticked keeps nothing, and a subject that is not
  // on a section's curriculum is dropped rather than sent to be refused.
  const payload = React.useMemo(
    () =>
      chosen
        .map(({ section, group }) => ({
          sectionId: section.id,
          subjectIds: (subjectsBySection[section.id] ?? []).filter((id) =>
            group.subjects.some((subject) => subject.id === id),
          ),
        }))
        .filter((entry) => entry.subjectIds.length > 0),
    [chosen, subjectsBySection],
  )

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const pairs = payload.reduce((running, entry) => running + entry.subjectIds.length, 0)

  /** Copies the first ticked section's subjects onto every other one. */
  function copyFromFirst() {
    const first = chosen[0]
    if (!first) return
    const wanted = subjectsBySection[first.section.id] ?? []
    setSubjectsBySection((current) => {
      const next = { ...current }
      for (const { section, group } of chosen) {
        next[section.id] = wanted.filter((id) => group.subjects.some((subject) => subject.id === id))
      }
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const response = await api.post<AssignmentBulkResult>(`/api/v1/staff/${staffId}/assignments`, {
        academicSessionId: sessionId,
        sections: payload,
      })
      setResult(response)
      if (response.created.length > 0) {
        toast.success(`${response.created.length} assignment${response.created.length === 1 ? '' : 's'} made.`)
        router.refresh()
      } else {
        toast.info('Nothing new to assign.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Assign subjects" description={staffName} className="sm:max-w-3xl">
        {result ? (
          <div className="space-y-3">
            <Outcome variant="success" title={`${result.created.length} assigned`} lines={result.created} />
            <Outcome variant="info" title={`${result.alreadyHeld.length} already held`} lines={result.alreadyHeld} />
            <Outcome variant="warning" title={`${result.refused.length} not in the curriculum`} lines={result.refused} />
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Field label="Academic session" htmlFor="assign-session" required>
              <Select
                id="assign-session"
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value)
                  setSectionIds([])
                  setSubjectsBySection({})
                }}
                disabled={busy}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold">Sections</h3>
                <p className="mb-2 text-xs text-foreground-muted">
                  {sectionIds.length === 0 ? 'Tick every section this teacher takes.' : `${sectionIds.length} chosen`}
                </p>
                <SectionQuickSelect
                  sections={everySection}
                  selected={sectionIds}
                  onChange={setSectionIds}
                  disabled={busy}
                />
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                  {groups === null ? (
                    <p className="text-xs text-foreground-muted">Loading the structure…</p>
                  ) : groups.length === 0 ? (
                    <p className="text-xs text-foreground-muted">This session has no sections yet.</p>
                  ) : (
                    groups.map((group) => {
                      const ids = group.sections.map((section) => section.id)
                      const allOn = ids.length > 0 && ids.every((id) => sectionIds.includes(id))
                      return (
                        <div key={group.academicGroupId}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground-muted">
                              {group.className} · {group.divisionName} · {group.programName}
                            </p>
                            {ids.length > 1 ? (
                              <button
                                type="button"
                                className="text-xs underline"
                                disabled={busy}
                                onClick={() =>
                                  setSectionIds((chosen) =>
                                    allOn ? chosen.filter((id) => !ids.includes(id)) : [...new Set([...chosen, ...ids])],
                                  )
                                }
                              >
                                {allOn ? 'none' : 'all'}
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-1 space-y-1 pl-1">
                            {group.sections.map((section) => (
                              <Checkbox
                                key={section.id}
                                label={`Section ${section.name}`}
                                description={section.inchargeName ? `in-charge: ${section.inchargeName}` : undefined}
                                checked={sectionIds.includes(section.id)}
                                disabled={busy}
                                onChange={() => setSectionIds((chosen) => toggle(chosen, section.id))}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">Subjects, section by section</h3>
                  {chosen.length > 1 ? (
                    <button type="button" className="text-xs underline" disabled={busy} onClick={copyFromFirst}>
                      same as the first
                    </button>
                  ) : null}
                </div>
                <p className="mb-2 text-xs text-foreground-muted">
                  {chosen.length === 0
                    ? 'Choose sections first — the subjects are theirs.'
                    : 'They need not be the same everywhere: a teacher can take two subjects in one class and one in another.'}
                </p>
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                  {chosen.length === 0 ? (
                    <p className="text-xs text-foreground-muted">Nothing to show yet.</p>
                  ) : (
                    chosen.map(({ section, group }) => {
                      const available = subjectsFor(group)
                      const picked = subjectsBySection[section.id] ?? []
                      return (
                        <div key={section.id}>
                          <p className="text-xs font-semibold text-foreground-muted">
                            {group.className} · {group.divisionName} · {group.programName} · Section {section.name}
                          </p>
                          {available.length === 0 ? (
                            <p className="mt-1 pl-1 text-xs text-foreground-muted">
                              This class has no curriculum yet.
                            </p>
                          ) : (
                            <div className="mt-1 space-y-1 pl-1">
                              {available.map((subject) => (
                                <Checkbox
                                  key={subject.id}
                                  label={subject.name}
                                  checked={picked.includes(subject.id)}
                                  disabled={busy}
                                  onChange={() =>
                                    setSubjectsBySection((current) => ({
                                      ...current,
                                      [section.id]: toggle(current[section.id] ?? [], subject.id),
                                    }))
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            </div>

            <DialogFooter>
              <p className="mr-auto text-xs text-foreground-muted">
                {pairs === 0 ? 'Nothing chosen yet.' : `${pairs} assignment${pairs === 1 ? '' : 's'} will be made.`}
              </p>
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy} disabled={pairs === 0}>
                Assign
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One outcome list, shown only when it has something in it. */
function Outcome({
  variant,
  title,
  lines,
}: {
  variant: 'success' | 'info' | 'warning'
  title: string
  lines: string[]
}) {
  if (lines.length === 0) return null
  return (
    <Alert variant={variant} title={title}>
      <ul className="mt-1 space-y-0.5 text-xs">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Alert>
  )
}
