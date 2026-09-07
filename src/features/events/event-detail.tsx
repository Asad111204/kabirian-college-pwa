'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CalendarCheck, FileEdit, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { EventDetail as EventDetailData } from '@/server/services/events.service'
import { AUDIENCE_LABEL, type EventStatusValue } from '@/validation/notices'
import { AttachmentsPanel } from '@/features/notices/attachments-panel'
import { EventStatusBadge, formatCollegeLocal } from '@/features/notices/shared'
import { EventEditorDialog } from './event-editor-dialog'

/**
 * Admin → one event.
 *
 * Publish and cancel are confirmed actions. A cancelled event stays visible
 * to its audience, marked -- the point of cancelling is that people find out
 * (ADR-150). The cover is chosen from the event's own pictures.
 */
export function EventDetail({
  initial,
  canManage,
  storageReady,
}: {
  initial: EventDetailData
  canManage: boolean
  storageReady: boolean
}) {
  const router = useRouter()
  const [event, setEvent] = React.useState(initial)
  const [editOpen, setEditOpen] = React.useState(false)
  const [statusTarget, setStatusTarget] = React.useState<EventStatusValue | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reload() {
    try {
      setEvent(await api.get<EventDetailData>(`/api/v1/events/${event.id}`))
    } catch {
      router.refresh()
    }
  }

  async function changeStatus() {
    if (!statusTarget) return
    setBusy(true)
    setError(null)
    try {
      setEvent(await api.patch<EventDetailData>(`/api/v1/events/${event.id}`, { status: statusTarget }))
      toast.success(
        statusTarget === 'PUBLISHED' ? 'Event published.' : statusTarget === 'CANCELLED' ? 'Event cancelled.' : 'Event returned to draft.',
      )
      setStatusTarget(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change the status.')
    } finally {
      setBusy(false)
    }
  }

  async function setCover(documentId: string | null) {
    try {
      setEvent(await api.put<EventDetailData>(`/api/v1/events/${event.id}/cover`, { documentId }))
      toast.success(documentId ? 'Cover picture set.' : 'Cover picture cleared.')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not change the cover.')
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/api/v1/events/${event.id}`)
      toast.success('Draft deleted.')
      router.push('/admin/events')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete the draft.')
      setBusy(false)
    }
  }

  const copy: Record<EventStatusValue, { title: string; body: string; action: string }> = {
    PUBLISHED: {
      title: 'Publish this event?',
      body: `It will show to ${AUDIENCE_LABEL[event.audience].toLowerCase()}.`,
      action: 'Publish',
    },
    CANCELLED: {
      title: 'Cancel this event?',
      body: 'It stays visible, marked as cancelled, so nobody turns up.',
      action: 'Cancel the event',
    },
    DRAFT: { title: 'Return this event to draft?', body: 'It stops showing until it is published again.', action: 'Return to draft' },
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <EventStatusBadge status={event.status} />
              <p className="mt-2 text-sm text-foreground-muted">
                {formatCollegeLocal(event.startsAtLocal)}
                {event.endsAtLocal ? ` – ${formatCollegeLocal(event.endsAtLocal)}` : ''}
                {event.location ? ` · ${event.location}` : ''} · {AUDIENCE_LABEL[event.audience]}
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
            {event.coverDocumentId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/v1/documents/${event.coverDocumentId}/content`}
                alt=""
                className="mb-4 max-h-72 w-full rounded-[var(--radius-control)] object-cover"
              />
            ) : null}
            {event.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{event.description}</p>
            ) : (
              <p className="text-sm text-foreground-muted">No description.</p>
            )}
          </CardContent>
        </Card>

        <AttachmentsPanel
          endpoint={`/api/v1/events/${event.id}/attachments`}
          attachments={event.attachments}
          types={[
            { key: 'EVENT_IMAGE', label: 'Picture', accept: 'image/jpeg,image/png,image/webp' },
            { key: 'EVENT_ATTACHMENT', label: 'File', accept: 'image/jpeg,image/png,application/pdf' },
          ]}
          canManage={canManage}
          storageReady={storageReady}
          onChanged={reload}
          extra={(file) =>
            canManage && file.mimeType.startsWith('image/') ? (
              file.id === event.coverDocumentId ? (
                <Button variant="ghost" size="sm" onClick={() => setCover(null)}>
                  Clear cover
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setCover(file.id)}>
                  Use as cover
                </Button>
              )
            ) : null
          }
        />
      </div>

      {canManage ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {event.status !== 'PUBLISHED' ? (
                <Button className="w-full" onClick={() => setStatusTarget('PUBLISHED')}>
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  Publish
                </Button>
              ) : null}
              {event.status === 'PUBLISHED' ? (
                <Button className="w-full" variant="secondary" onClick={() => setStatusTarget('CANCELLED')}>
                  <Ban className="h-4 w-4" aria-hidden />
                  Cancel event
                </Button>
              ) : null}
              {event.status === 'CANCELLED' ? (
                <Button className="w-full" variant="secondary" onClick={() => setStatusTarget('DRAFT')}>
                  <FileEdit className="h-4 w-4" aria-hidden />
                  Return to draft
                </Button>
              ) : null}
              {event.status === 'DRAFT' ? (
                <Button className="w-full" variant="ghost" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete draft
                </Button>
              ) : (
                <p className="text-xs text-foreground-muted">An event that has been published is cancelled, not deleted.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <EventEditorDialog open={editOpen} onOpenChange={setEditOpen} initial={event} onSaved={(saved) => setEvent(saved)} />

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        {statusTarget ? (
          <DialogContent title={copy[statusTarget].title} description={event.title}>
            <div className="space-y-4">
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <p className="text-sm text-foreground-muted">{copy[statusTarget].body}</p>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setStatusTarget(null)}>
                  Back
                </Button>
                <Button type="button" onClick={changeStatus} disabled={busy}>
                  {busy ? 'Working…' : copy[statusTarget].action}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete this draft?" description={event.title}>
          <div className="space-y-4">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <p className="text-sm text-foreground-muted">It has never been published. Its pictures and files go to the Drive trash.</p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
                Back
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
