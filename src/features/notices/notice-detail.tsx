'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, FileEdit, Megaphone, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { NoticeDetail as NoticeDetailData, NoticeTargetOptions } from '@/server/services/notices.service'
import type { PublishStatusValue } from '@/validation/notices'
import { AttachmentsPanel } from './attachments-panel'
import { NoticeEditorDialog } from './notice-editor-dialog'
import { CategoryBadge, NoticeStatusBadge, PinnedBadge, formatCollegeLocal, windowSentence } from './shared'

/**
 * Admin → one notice.
 *
 * Publishing, archiving and returning to draft are separate, confirmed
 * actions here rather than a status field on the form: putting a notice in
 * front of the whole college is worth one deliberate click. A notice that has
 * been published cannot be deleted -- it is archived, and the record of what
 * the college said stays.
 */
export function NoticeDetail({
  initial,
  options,
  canManage,
  storageReady,
}: {
  initial: NoticeDetailData
  options: NoticeTargetOptions
  canManage: boolean
  storageReady: boolean
}) {
  const router = useRouter()
  const [notice, setNotice] = React.useState(initial)
  const [editOpen, setEditOpen] = React.useState(false)
  const [statusTarget, setStatusTarget] = React.useState<PublishStatusValue | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reload() {
    try {
      setNotice(await api.get<NoticeDetailData>(`/api/v1/notices/${notice.id}`))
    } catch {
      router.refresh()
    }
  }

  async function changeStatus() {
    if (!statusTarget) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.patch<NoticeDetailData>(`/api/v1/notices/${notice.id}`, { status: statusTarget })
      setNotice(updated)
      toast.success(
        statusTarget === 'PUBLISHED'
          ? 'Notice published.'
          : statusTarget === 'ARCHIVED'
            ? 'Notice archived.'
            : 'Notice returned to draft.',
      )
      setStatusTarget(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change the status. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/api/v1/notices/${notice.id}`)
      toast.success('Draft deleted.')
      router.push('/admin/notices')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete the draft.')
      setBusy(false)
    }
  }

  const statusCopy: Record<PublishStatusValue, { title: string; body: string; action: string }> = {
    PUBLISHED: {
      title: 'Publish this notice?',
      body: `It will show to ${notice.audienceSummary.toLowerCase()} from ${formatCollegeLocal(notice.publishAtLocal)}${
        notice.expiresAtLocal ? ` until ${formatCollegeLocal(notice.expiresAtLocal)}` : ''
      }.`,
      action: 'Publish',
    },
    ARCHIVED: {
      title: 'Archive this notice?',
      body: 'It disappears from every feed and stays in the record. It can be returned to draft and published again.',
      action: 'Archive',
    },
    DRAFT: {
      title: 'Return this notice to draft?',
      body: 'It stops showing until it is published again.',
      action: 'Return to draft',
    },
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <NoticeStatusBadge status={notice.status} />
                <CategoryBadge category={notice.category} />
                {notice.isPinned ? <PinnedBadge /> : null}
              </div>
              <p className="mt-2 text-sm text-foreground-muted">
                Showing {windowSentence(notice.publishAtLocal, notice.expiresAtLocal)}
                {notice.createdByName ? ` · written by ${notice.createdByName}` : ''}
              </p>
            </div>
            {canManage ? (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {/* Plain text, line breaks kept. Never rendered as markup. */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{notice.body}</p>
          </CardContent>
        </Card>

        <AttachmentsPanel
          endpoint={`/api/v1/notices/${notice.id}/attachments`}
          attachments={notice.attachments}
          types={[{ key: 'NOTICE_ATTACHMENT', label: 'File', accept: 'image/jpeg,image/png,application/pdf' }]}
          canManage={canManage}
          storageReady={storageReady}
          onChanged={reload}
        />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Who it is for</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {notice.targets.map((t) => (
                <li key={t.id} className="text-sm text-foreground">
                  {t.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {notice.status !== 'PUBLISHED' ? (
                <Button className="w-full" onClick={() => setStatusTarget('PUBLISHED')}>
                  <Megaphone className="h-4 w-4" aria-hidden />
                  Publish
                </Button>
              ) : null}
              {notice.status === 'PUBLISHED' ? (
                <Button className="w-full" variant="secondary" onClick={() => setStatusTarget('ARCHIVED')}>
                  <Archive className="h-4 w-4" aria-hidden />
                  Archive
                </Button>
              ) : null}
              {notice.status === 'ARCHIVED' ? (
                <Button className="w-full" variant="secondary" onClick={() => setStatusTarget('DRAFT')}>
                  <FileEdit className="h-4 w-4" aria-hidden />
                  Return to draft
                </Button>
              ) : null}
              {notice.status === 'DRAFT' ? (
                <Button className="w-full" variant="ghost" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete draft
                </Button>
              ) : (
                <p className="text-xs text-foreground-muted">
                  A notice that has been published is archived, not deleted.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <NoticeEditorDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        options={options}
        initial={notice}
        onSaved={(saved) => setNotice(saved)}
      />

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        {statusTarget ? (
          <DialogContent title={statusCopy[statusTarget].title} description={notice.title}>
            <div className="space-y-4">
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <p className="text-sm text-foreground-muted">{statusCopy[statusTarget].body}</p>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setStatusTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={changeStatus} disabled={busy}>
                  {busy ? 'Working…' : statusCopy[statusTarget].action}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete this draft?" description={notice.title}>
          <div className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <p className="text-sm text-foreground-muted">
              It has never been published, so nobody has seen it. Its attachments go to the Drive
              trash.
            </p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete draft'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
