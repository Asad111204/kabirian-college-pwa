'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'

export interface SessionRow {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSED'
  isCurrent: boolean
  groupCount: number
}

const STATUS_VARIANT = {
  UPCOMING: 'info',
  ACTIVE: 'success',
  CLOSED: 'neutral',
} as const

export function SessionsManager({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SessionRow | null>(null)
  const [form, setForm] = React.useState({
    name: '',
    startDate: '',
    endDate: '',
    status: 'UPCOMING',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<SessionRow | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  function openCreate() {
    // Suggest the next academic year, e.g. 2026-27 running Aug–Jul.
    const year = new Date().getFullYear()
    setEditing(null)
    setForm({
      name: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
      startDate: `${year}-08-01`,
      endDate: `${year + 1}-07-31`,
      status: 'UPCOMING',
    })
    setFormError(null)
    setFieldErrors({})
    setDialogOpen(true)
  }

  function openEdit(session: SessionRow) {
    setEditing(session)
    setForm({
      name: session.name,
      startDate: session.startDate,
      endDate: session.endDate,
      status: session.status,
    })
    setFormError(null)
    setFieldErrors({})
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    try {
      if (editing) {
        await api.put(`/api/v1/academics/sessions/${editing.id}`, form)
        toast.success('Session updated.')
      } else {
        await api.post('/api/v1/academics/sessions', form)
        toast.success('Session created.')
      }
      setDialogOpen(false)
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function makeCurrent(session: SessionRow) {
    setBusyId(session.id)
    try {
      await api.post(`/api/v1/academics/sessions/${session.id}/set-current`)
      toast.success(`${session.name} is now the current session.`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    setDeleteError(null)
    try {
      await api.delete(`/api/v1/academics/sessions/${confirmDelete.id}`)
      toast.success('Session deleted.')
      setConfirmDelete(null)
      router.refresh()
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm text-foreground-muted">
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add session
          </Button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            title="No academic sessions yet"
            description="Create one — for example 2026-27 — and mark it as the current session."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add session
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Session</TH>
                  <TH>Starts</TH>
                  <TH>Ends</TH>
                  <TH>Groups</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.map((session) => (
                  <TR key={session.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{session.name}</span>
                        {session.isCurrent ? <Badge variant="brand">Current</Badge> : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-foreground-muted">{session.startDate}</TD>
                    <TD className="whitespace-nowrap text-foreground-muted">{session.endDate}</TD>
                    <TD className="text-foreground-muted">{session.groupCount}</TD>
                    <TD>
                      <Badge variant={STATUS_VARIANT[session.status]}>{session.status}</Badge>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {!session.isCurrent ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busyId === session.id}
                            onClick={() => makeCurrent(session)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Make current</span>
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(session)}>
                          <Pencil className="h-4 w-4" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmDelete(session)
                          }}
                          aria-label={`Delete ${session.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent title={editing ? 'Edit academic session' : 'Add academic session'}>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {formError ? <Alert variant="danger">{formError}</Alert> : null}

            <Field
              label="Session name"
              htmlFor="name"
              required
              hint="Use the format 2026-27."
              error={fieldErrors.name}
            >
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="2026-27"
                disabled={submitting}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="startDate" required error={fieldErrors.startDate}>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  disabled={submitting}
                />
              </Field>

              <Field label="End date" htmlFor="endDate" required error={fieldErrors.endDate}>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  disabled={submitting}
                />
              </Field>
            </div>

            <Field label="Status" htmlFor="status" error={fieldErrors.status}>
              <Select
                id="status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                disabled={submitting}
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                {editing ? 'Save changes' : 'Create session'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent title="Delete this session?" description={confirmDelete?.name}>
          {deleteError ? (
            <Alert variant="warning" title="This session is in use">
              {deleteError}
            </Alert>
          ) : (
            <Alert variant="warning">
              A session can only be deleted while it has no groups, curriculum or students. Sessions
              with history must be kept — close them instead.
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmDelete(null)
                setDeleteError(null)
              }}
            >
              Cancel
            </Button>
            {!deleteError ? (
              <Button
                variant="danger"
                loading={busyId === confirmDelete?.id}
                onClick={handleDelete}
              >
                Delete permanently
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
