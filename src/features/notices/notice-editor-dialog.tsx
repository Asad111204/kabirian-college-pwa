'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { NoticeDetail, NoticeTargetOptions } from '@/server/services/notices.service'
import {
  AUDIENCE_LABEL,
  AUDIENCES,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABEL,
  type AudienceValue,
  type NoticeCategoryValue,
} from '@/validation/notices'

/** One row of the audience builder: what kind of target, and which one. */
interface TargetRow {
  key: number
  audience: AudienceValue
  /** The chosen class / division / programme / group / section id; '' for a population. */
  id: string
}

interface NoticeFormValues {
  title: string
  body: string
  category: NoticeCategoryValue
  isPinned: boolean
  publishAt: string
  expiresAt: string
  targets: TargetRow[]
}

const STRUCTURAL: AudienceValue[] = ['CLASS', 'DIVISION', 'PROGRAM', 'GROUP', 'SECTION']

/** The API field a structural audience's id goes in. */
const ID_FIELD: Record<AudienceValue, string | null> = {
  ALL: null,
  STUDENTS: null,
  STAFF: null,
  CLASS: 'classId',
  DIVISION: 'divisionId',
  PROGRAM: 'programId',
  GROUP: 'academicGroupId',
  SECTION: 'sectionId',
}

function optionsFor(audience: AudienceValue, options: NoticeTargetOptions): { id: string; label: string }[] {
  switch (audience) {
    case 'CLASS':
      return options.classes.map((c) => ({ id: c.id, label: c.name }))
    case 'DIVISION':
      return options.divisions.map((d) => ({ id: d.id, label: d.name }))
    case 'PROGRAM':
      return options.programs.map((p) => ({ id: p.id, label: p.name }))
    case 'GROUP':
      return options.groups
    case 'SECTION':
      return options.sections
    default:
      return []
  }
}

function fromDetail(notice: NoticeDetail): NoticeFormValues {
  return {
    title: notice.title,
    body: notice.body,
    category: notice.category,
    isPinned: notice.isPinned,
    publishAt: notice.publishAtLocal,
    expiresAt: notice.expiresAtLocal ?? '',
    targets: notice.targets.map((t, i) => ({
      key: i,
      audience: t.audience,
      id: t.classId ?? t.divisionId ?? t.programId ?? t.academicGroupId ?? t.sectionId ?? '',
    })),
  }
}

const BLANK: NoticeFormValues = {
  title: '',
  body: '',
  category: 'GENERAL',
  isPinned: false,
  publishAt: '',
  expiresAt: '',
  targets: [{ key: 0, audience: 'ALL', id: '' }],
}

/**
 * Write or edit a notice.
 *
 * The audience is built from rows -- "everyone", "all students", "Section A
 * of 1st Year Boys Pre-Medical" -- and every option comes from the server, so
 * the form never decides what a section is. Times are typed on the college's
 * clock and sent as they are; the server applies the zone (ADR-151).
 *
 * There is no status control here. Publishing is its own audited action on
 * the notice page, so a slip on this form cannot put a draft in front of a
 * thousand students.
 */
export function NoticeEditorDialog({
  open,
  onOpenChange,
  options,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: NoticeTargetOptions
  initial?: NoticeDetail
  onSaved: (notice: NoticeDetail) => void | Promise<void>
}) {
  const editing = Boolean(initial)
  const [values, setValues] = React.useState<NoticeFormValues>(initial ? fromDetail(initial) : BLANK)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})
  const nextKey = React.useRef(100)

  // Reset on open, during render (see ExamFormDialog for why not an effect).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initial ? fromDetail(initial) : BLANK)
      setFormError(null)
      setFieldErrors({})
    }
  }

  const set = (patch: Partial<NoticeFormValues>) => setValues((v) => ({ ...v, ...patch }))
  const setTarget = (key: number, patch: Partial<TargetRow>) =>
    set({ targets: values.targets.map((t) => (t.key === key ? { ...t, ...patch } : t)) })
  const addTarget = () =>
    set({ targets: [...values.targets, { key: nextKey.current++, audience: 'SECTION', id: '' }] })
  const removeTarget = (key: number) => set({ targets: values.targets.filter((t) => t.key !== key) })

  const errorOf = (field: string) => fieldErrors[field]?.[0]
  /** Zod reports target errors as `targets.<index>.<field>`; show them on the row. */
  const targetError = (index: number) =>
    Object.entries(fieldErrors).find(([k]) => k.startsWith(`targets.${index}.`))?.[1]?.[0]

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const payload = {
      title: values.title.trim(),
      body: values.body.trim(),
      category: values.category,
      isPinned: values.isPinned,
      publishAt: values.publishAt || '',
      expiresAt: values.expiresAt || '',
      targets: values.targets.map((t) => {
        const field = ID_FIELD[t.audience]
        return field ? { audience: t.audience, [field]: t.id } : { audience: t.audience }
      }),
    }

    try {
      const saved = editing
        ? await api.put<NoticeDetail>(`/api/v1/notices/${initial!.id}`, payload)
        : await api.post<NoticeDetail>('/api/v1/notices', payload)
      toast.success(editing ? 'Notice updated.' : 'Notice saved as a draft.')
      onOpenChange(false)
      await onSaved(saved)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title={editing ? 'Edit notice' : 'Write a notice'}
        description={
          editing
            ? 'Changes replace the text and the whole audience.'
            : 'It is saved as a draft. Publish it from its own page when it is ready.'
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <Field label="Title" htmlFor="notice-title" required error={errorOf('title')}>
            <Input
              id="notice-title"
              value={values.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Sports day on Friday"
              autoFocus
              required
              maxLength={200}
            />
          </Field>

          <Field label="Notice" htmlFor="notice-body" required error={errorOf('body')}>
            <Textarea
              id="notice-body"
              value={values.body}
              onChange={(e) => set({ body: e.target.value })}
              rows={6}
              required
              placeholder="What the college wants to say. Line breaks are kept."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="notice-category" error={errorOf('category')}>
              <Select
                id="notice-category"
                value={values.category}
                onChange={(e) => set({ category: e.target.value as NoticeCategoryValue })}
              >
                {NOTICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {NOTICE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                checked={values.isPinned}
                onChange={(e) => set({ isPinned: e.target.checked })}
                label="Pin to the top of every feed"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Show from"
              htmlFor="notice-publish-at"
              hint="Leave empty to show as soon as it is published."
              error={errorOf('publishAt')}
            >
              <Input
                id="notice-publish-at"
                type="datetime-local"
                value={values.publishAt}
                onChange={(e) => set({ publishAt: e.target.value })}
              />
            </Field>
            <Field
              label="Hide after"
              htmlFor="notice-expires-at"
              hint="Leave empty to keep it until it is archived."
              error={errorOf('expiresAt')}
            >
              <Input
                id="notice-expires-at"
                type="datetime-local"
                value={values.expiresAt}
                onChange={(e) => set({ expiresAt: e.target.value })}
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">
              Who it is for <span className="text-danger-600">*</span>
            </legend>
            {errorOf('targets') ? <p className="text-sm text-danger-700">{errorOf('targets')}</p> : null}
            {values.targets.map((row, index) => {
              const structural = STRUCTURAL.includes(row.audience)
              const choices = optionsFor(row.audience, options)
              const rowError = targetError(index)
              return (
                <div key={row.key} className="flex flex-wrap items-start gap-2">
                  <Select
                    aria-label={`Audience ${index + 1}`}
                    value={row.audience}
                    onChange={(e) =>
                      setTarget(row.key, { audience: e.target.value as AudienceValue, id: '' })
                    }
                    className="w-44"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </option>
                    ))}
                  </Select>
                  {structural ? (
                    <div className="min-w-0 flex-1">
                      <Select
                        aria-label={`Which ${AUDIENCE_LABEL[row.audience].toLowerCase()}`}
                        value={row.id}
                        onChange={(e) => setTarget(row.key, { id: e.target.value })}
                        required
                      >
                        <option value="">Choose…</option>
                        {choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                      {choices.length === 0 ? (
                        <p className="mt-1 text-xs text-warning-700">
                          Nothing to choose from — the current session has no{' '}
                          {AUDIENCE_LABEL[row.audience].toLowerCase().replace('a ', '')}s yet.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {values.targets.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTarget(row.key)}
                      aria-label={`Remove audience ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                  {rowError ? <p className="w-full text-sm text-danger-700">{rowError}</p> : null}
                </div>
              )
            })}
            <Button type="button" variant="ghost" size="sm" onClick={addTarget}>
              <Plus className="h-4 w-4" aria-hidden />
              Add another audience
            </Button>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
