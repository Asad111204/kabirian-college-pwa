'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import type { HomeworkDetail as HomeworkDetailData, HomeworkOptions } from '@/server/services/homework.service'
import { AttachmentsPanel } from '@/features/notices/attachments-panel'
import { HomeworkEditorDialog } from './homework-editor-dialog'
import { DueBadge, formatCollegeDate, placementLabel } from './shared'

/**
 * One piece of homework: instructions, due date, files. The person who set
 * it (or the office) may change it, attach files and remove it; everyone
 * else in the section reads it. `homework.canManage` is the server's word.
 */
export function HomeworkDetail({
  homework: initial,
  basePath,
  options,
  storageReady,
}: {
  homework: HomeworkDetailData
  /** `/staff/homework`, `/admin/homework` or `/student/homework` */
  basePath: string
  options: HomeworkOptions
  storageReady: boolean
}) {
  const router = useRouter()
  const [homework, setHomework] = React.useState(initial)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reload() {
    setHomework(await api.get<HomeworkDetailData>(`/api/v1/homework/${homework.id}`))
  }

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await api.delete(`/api/v1/homework/${homework.id}`)
      toast.success('Homework removed.')
      router.push(basePath)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The homework could not be removed.')
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={basePath}>
            <ArrowLeft className="h-4 w-4" />
            All homework
          </Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>{homework.title}</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {homework.subjectName} · {placementLabel(homework)} · set by {homework.teacherName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DueBadge due={homework.due} />
            {homework.canManage ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Change
                </Button>
                <Button variant="ghost" size="sm" className="text-danger-600" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Due</dt>
              <dd className="mt-0.5">{formatCollegeDate(homework.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Set on</dt>
              <dd className="mt-0.5">{formatDateTime(homework.createdAt)}</dd>
            </div>
          </dl>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Instructions</h3>
            {homework.instructions ? (
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">{homework.instructions}</p>
            ) : (
              <p className="mt-1 text-sm text-foreground-subtle">No instructions were written.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <AttachmentsPanel
          endpoint={`/api/v1/homework/${homework.id}/attachments`}
          attachments={homework.attachments}
          types={[{ key: 'HOMEWORK_ATTACHMENT', label: 'File', accept: 'image/jpeg,image/png,application/pdf' }]}
          canManage={homework.canManage}
          storageReady={storageReady}
          onChanged={reload}
        />
      </div>

      <HomeworkEditorDialog open={editOpen} onOpenChange={setEditOpen} options={options} existing={homework} onSaved={(saved) => setHomework(saved)} />

      <Dialog open={deleteOpen} onOpenChange={(open) => !open && !deleting && setDeleteOpen(false)}>
        <DialogContent title="Remove this homework?" description="It disappears from every list. The record is kept in the audit log.">
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button type="button" variant="danger" loading={deleting} onClick={remove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
