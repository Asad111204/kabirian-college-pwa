'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Power, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { StatusBadge } from '@/components/ui/badge'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'

/**
 * A reusable "manage a list of things" screen.
 *
 * Classes, Divisions, Programs and Subjects all need exactly the same screen:
 * a table, an Add button, an edit dialog, activate/deactivate and a guarded
 * delete. Writing it once means every one of them behaves identically and a fix
 * applies everywhere.
 */

export type FieldType = 'text' | 'number' | 'textarea' | 'checkbox'

export interface ResourceField {
  name: string
  label: string
  type: FieldType
  required?: boolean
  hint?: string
  placeholder?: string
  defaultValue?: string | number | boolean
  /** Forces upper case as the user types (used for codes). */
  uppercase?: boolean
  min?: number
  max?: number
}

/** The minimum every managed record must have. Extra fields are kept and typed. */
export interface ResourceRecord {
  id: string
  isActive: boolean
}

export interface ResourceColumn<T extends ResourceRecord> {
  header: string
  render: (item: T) => React.ReactNode
  className?: string
}

export interface ResourceManagerProps<T extends ResourceRecord> {
  /** e.g. "/api/v1/academics/programs" */
  endpoint: string
  /** Singular noun shown in buttons and messages, e.g. "program". */
  singular: string
  items: T[]
  columns: ResourceColumn<T>[]
  fields: ResourceField[]
  /** Turns a record into the form values used when editing. */
  toFormValues: (item: T) => Record<string, string | boolean>
  /** Human label for a record, used in confirmation messages. */
  labelOf: (item: T) => string
  emptyTitle?: string
  emptyDescription?: string
  searchPlaceholder?: string
}

type FormValues = Record<string, string | boolean>

function initialValues(fields: ResourceField[]): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    if (field.type === 'checkbox') values[field.name] = field.defaultValue !== false
    else values[field.name] = field.defaultValue === undefined ? '' : String(field.defaultValue)
  }
  return values
}

export function ResourceManager<T extends ResourceRecord>({
  endpoint,
  singular,
  items,
  columns,
  fields,
  toFormValues,
  labelOf,
  emptyTitle,
  emptyDescription,
  searchPlaceholder,
}: ResourceManagerProps<T>) {
  const router = useRouter()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<T | null>(null)
  const [values, setValues] = React.useState<FormValues>(() => initialValues(fields))
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  const [confirmDelete, setConfirmDelete] = React.useState<T | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (!showInactive && !item.isActive) return false
      if (!term) return true
      return labelOf(item).toLowerCase().includes(term)
    })
  }, [items, search, showInactive, labelOf])

  function openCreate() {
    setEditing(null)
    setValues(initialValues(fields))
    setFormError(null)
    setFieldErrors({})
    setDialogOpen(true)
  }

  function openEdit(item: T) {
    setEditing(item)
    setValues({ ...initialValues(fields), ...toFormValues(item) })
    setFormError(null)
    setFieldErrors({})
    setDialogOpen(true)
  }

  /** Numbers are sent as numbers, empty optional text as undefined. */
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const field of fields) {
      const raw = values[field.name]
      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(raw)
      } else if (field.type === 'number') {
        payload[field.name] = raw === '' ? undefined : Number(raw)
      } else {
        const text = typeof raw === 'string' ? raw.trim() : ''
        payload[field.name] = text === '' ? undefined : text
      }
    }
    return payload
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const payload = buildPayload()

      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, payload)
        toast.success(`${capitalize(singular)} updated.`)
      } else {
        await api.post(endpoint, payload)
        toast.success(`${capitalize(singular)} created.`)
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

  async function toggleActive(item: T) {
    setBusyId(item.id)
    try {
      await api.patch(`${endpoint}/${item.id}`, { isActive: !item.isActive })
      toast.success(
        item.isActive
          ? `${labelOf(item)} deactivated. Existing records are unchanged.`
          : `${labelOf(item)} activated.`,
      )
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await api.delete(`${endpoint}/${confirmDelete.id}`)
      toast.success(`${labelOf(confirmDelete)} deleted.`)
      setConfirmDelete(null)
      router.refresh()
    } catch (error) {
      // The usual case: the record is in use, so the server refused. Show why.
      setDeleteError(error instanceof ApiError ? error.message : 'Could not delete.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? `Search ${singular}s…`}
              className="pl-9"
              aria-label={`Search ${singular}s`}
            />
          </div>

          <label className="flex shrink-0 items-center gap-2 text-sm text-foreground-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]"
            />
            Show inactive
          </label>

          <Button onClick={openCreate} size="sm" className="shrink-0">
            <Plus className="h-4 w-4" />
            Add {singular}
          </Button>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={search ? `No ${singular}s match "${search}"` : (emptyTitle ?? `No ${singular}s yet`)}
            description={search ? 'Try a different search term.' : emptyDescription}
            action={
              search ? null : (
                <Button onClick={openCreate} size="sm">
                  <Plus className="h-4 w-4" />
                  Add {singular}
                </Button>
              )
            }
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  {columns.map((column) => (
                    <TH key={column.header} className={column.className}>
                      {column.header}
                    </TH>
                  ))}
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((item) => (
                  <TR key={item.id} className={item.isActive ? undefined : 'opacity-65'}>
                    {columns.map((column) => (
                      <TD key={column.header} className={column.className}>
                        {column.render(item)}
                      </TD>
                    ))}
                    <TD>
                      <StatusBadge active={item.isActive} />
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${labelOf(item)}`}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyId === item.id}
                          onClick={() => toggleActive(item)}
                          aria-label={`${item.isActive ? 'Deactivate' : 'Activate'} ${labelOf(item)}`}
                        >
                          <Power className="h-4 w-4" />
                          <span className="hidden sm:inline">
                            {item.isActive ? 'Deactivate' : 'Activate'}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmDelete(item)
                          }}
                          aria-label={`Delete ${labelOf(item)}`}
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          title={editing ? `Edit ${singular}` : `Add ${singular}`}
          description={
            editing ? undefined : `This ${singular} becomes available everywhere immediately.`
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {formError ? <Alert variant="danger">{formError}</Alert> : null}

            {fields.map((field) => {
              const value = values[field.name]

              if (field.type === 'checkbox') {
                return (
                  <Checkbox
                    key={field.name}
                    label={field.label}
                    description={field.hint}
                    checked={Boolean(value)}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                    }
                    disabled={submitting}
                  />
                )
              }

              const commonProps = {
                id: field.name,
                value: typeof value === 'string' ? value : '',
                disabled: submitting,
                placeholder: field.placeholder,
                'aria-invalid': Boolean(fieldErrors[field.name]),
                onChange: (
                  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                ) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: field.uppercase ? e.target.value.toUpperCase() : e.target.value,
                  })),
              }

              return (
                <Field
                  key={field.name}
                  label={field.label}
                  htmlFor={field.name}
                  required={field.required}
                  hint={field.hint}
                  error={fieldErrors[field.name]}
                >
                  {field.type === 'textarea' ? (
                    <Textarea {...commonProps} />
                  ) : (
                    <Input
                      {...commonProps}
                      type={field.type === 'number' ? 'number' : 'text'}
                      min={field.min}
                      max={field.max}
                      inputMode={field.type === 'number' ? 'numeric' : undefined}
                    />
                  )}
                </Field>
              )
            })}

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
                {editing ? 'Save changes' : `Create ${singular}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent
          title={`Delete this ${singular}?`}
          description={confirmDelete ? labelOf(confirmDelete) : undefined}
        >
          {deleteError ? (
            <Alert variant="warning" title="This record is in use">
              {deleteError}
            </Alert>
          ) : (
            <Alert variant="warning">
              Permanent deletion is only possible while nothing uses this {singular}. If it is
              already part of the college&apos;s records, deactivate it instead — that hides it from
              new entries and keeps all history intact.
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
            {confirmDelete && !deleteError ? (
              <Button variant="danger" loading={deleting} onClick={handleDelete}>
                Delete permanently
              </Button>
            ) : null}
            {confirmDelete && deleteError ? (
              <Button
                variant="primary"
                loading={busyId === confirmDelete.id}
                onClick={async () => {
                  await toggleActive(confirmDelete)
                  setConfirmDelete(null)
                  setDeleteError(null)
                }}
                disabled={!confirmDelete.isActive}
              >
                Deactivate instead
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
