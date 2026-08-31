'use client'

/**
 * The document checklist shown on a student's or a staff member's profile.
 *
 * The same component serves both, and the same component serves an
 * administrator and a class teacher — what differs is what the server sent.
 * Nothing here decides who may see what: the API already applied those rules and
 * marked each row `canView`. Hiding a button is a courtesy to the user, never
 * the security control.
 */
import * as React from 'react'
import { toast } from 'sonner'
import {
  Check,
  Download,
  Eye,
  FileText,
  History,
  Lock,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api-client'
import { formatBytes, formatDateTime } from '@/lib/format'

export interface DocumentTypeView {
  key: string
  label: string
  description: string | null
  isRequired: boolean
  isSensitive: boolean
  allowedMimeTypes: string[]
  maxSizeBytes: number
  sortOrder: number
}

export interface DocumentView {
  id: string
  documentTypeKey: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  status: string
  uploadedAt: string
  uploadedByName: string | null
}

export interface DocumentSlot {
  type: DocumentTypeView
  document: DocumentView | null
  canView: boolean
  history: DocumentView[]
}

export function DocumentPanel({
  slots: initialSlots,
  ownerEndpoint,
  canManage,
  storageReady,
}: {
  slots: DocumentSlot[]
  /** e.g. `/api/v1/students/<id>/documents` */
  ownerEndpoint: string
  /** Whether this viewer may upload, replace or delete. */
  canManage: boolean
  /** False when Google Drive has not been connected yet. */
  storageReady: boolean
}) {
  const [slots, setSlots] = React.useState(initialSlots)
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<{ slot: DocumentSlot } | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [showHistoryFor, setShowHistoryFor] = React.useState<string | null>(null)

  const missingRequired = slots.filter((slot) => slot.type.isRequired && !slot.document)

  async function refresh() {
    try {
      setSlots(await api.get<DocumentSlot[]>(ownerEndpoint))
    } catch {
      // A failed refresh is not worth an error toast — the upload itself
      // already reported its own outcome.
    }
  }

  async function handleFile(slot: DocumentSlot, file: File) {
    setBusyKey(slot.type.key)
    const body = new FormData()
    body.append('file', file)
    body.append('documentTypeKey', slot.type.key)

    try {
      const response = await fetch(ownerEndpoint, { method: 'POST', body, credentials: 'same-origin' })
      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          (payload as { error?: { message?: string } } | null)?.error?.message ??
          'The upload did not go through.'
        throw new Error(message)
      }

      toast.success(slot.document ? `${slot.type.label} replaced.` : `${slot.type.label} uploaded.`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upload did not go through.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDelete() {
    const slot = confirmDelete?.slot
    if (!slot?.document) return

    setDeleting(true)
    try {
      await api.delete(`/api/v1/documents/${slot.document.id}`)
      toast.success(`${slot.type.label} removed. The file is recoverable from the Drive trash for 30 days.`)
      setConfirmDelete(null)
      await refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that document.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {missingRequired.length === 0
                ? 'All required documents are on file.'
                : `${missingRequired.length} required document${missingRequired.length === 1 ? '' : 's'} still missing.`}
            </CardDescription>
          </div>
          {missingRequired.length === 0 ? (
            <Badge variant="success">Complete</Badge>
          ) : (
            <Badge variant="warning">Incomplete</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {canManage && !storageReady ? (
          <Alert variant="warning" title="Google Drive is not connected">
            Documents cannot be uploaded until an administrator connects Google Drive in{' '}
            <a href="/admin/settings">Settings</a>.
          </Alert>
        ) : null}

        <ul className="space-y-2">
          {slots.map((slot) => (
            <SlotRow
              key={slot.type.key}
              slot={slot}
              canManage={canManage && storageReady}
              busy={busyKey === slot.type.key}
              onUpload={(file) => handleFile(slot, file)}
              onDelete={() => setConfirmDelete({ slot })}
              onToggleHistory={() =>
                setShowHistoryFor((current) => (current === slot.type.key ? null : slot.type.key))
              }
              historyOpen={showHistoryFor === slot.type.key}
            />
          ))}
        </ul>
      </CardContent>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent
          title={`Remove ${confirmDelete?.slot.type.label ?? 'document'}?`}
          description="The record of this document is kept; the file goes to the Drive trash."
        >
          <Alert variant="info" title="This can be undone">
            The file stays in the Google Drive trash for 30 days, and the record of who uploaded it
            and when is kept permanently.
          </Alert>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Remove document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SlotRow({
  slot,
  canManage,
  busy,
  onUpload,
  onDelete,
  onToggleHistory,
  historyOpen,
}: {
  slot: DocumentSlot
  canManage: boolean
  busy: boolean
  onUpload: (file: File) => void
  onDelete: () => void
  onToggleHistory: () => void
  historyOpen: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { type, document } = slot

  return (
    <li className="rounded-[var(--radius-control)] border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {document ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success-600" aria-hidden />
            ) : type.isRequired ? (
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning-600" aria-hidden />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
            )}
            {type.label}
            {type.isRequired ? (
              <span className="text-xs font-normal text-foreground-muted">(required)</span>
            ) : null}
            {type.isSensitive ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-normal text-foreground-muted"
                title="Identity document — restricted to the office"
              >
                <Lock className="h-3 w-3" aria-hidden />
                Sensitive
              </span>
            ) : null}
          </p>

          {document ? (
            <p className="mt-0.5 truncate text-xs text-foreground-muted">
              {document.originalFileName} · {formatBytes(document.fileSizeBytes)} ·{' '}
              {formatDateTime(document.uploadedAt)}
              {document.uploadedByName ? ` · by ${document.uploadedByName}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-foreground-muted">
              {type.description ?? 'Not uploaded yet.'}
              {' Up to '}
              {formatBytes(type.maxSizeBytes)}.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {document && slot.canView ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/api/v1/documents/${document.id}/content`} target="_blank" rel="noreferrer noopener">
                  <Eye className="h-4 w-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only">View</span>
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/api/v1/documents/${document.id}/content?download=1`}>
                  <Download className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Download</span>
                </a>
              </Button>
            </>
          ) : document ? (
            <span className="flex items-center gap-1 text-xs text-foreground-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              On file — restricted
            </span>
          ) : null}

          {slot.history.length > 0 && slot.canView ? (
            <Button variant="ghost" size="sm" onClick={onToggleHistory}>
              <History className="h-4 w-4" aria-hidden />
              <span className="sr-only">Previous versions</span>
            </Button>
          ) : null}

          {canManage ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={type.allowedMimeTypes.join(',')}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  // Reset first, so choosing the same file twice still fires.
                  event.target.value = ''
                  if (file) onUpload(file)
                }}
              />
              <Button
                variant={document ? 'ghost' : 'secondary'}
                size="sm"
                loading={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">{document ? 'Replace' : 'Upload'}</span>
              </Button>

              {document ? (
                <Button variant="ghost" size="sm" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 text-danger-600" aria-hidden />
                  <span className="sr-only">Remove</span>
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {historyOpen && slot.history.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {slot.history.map((old) => (
            <li key={old.id} className="flex items-center justify-between gap-2 text-xs text-foreground-muted">
              <span className="truncate">
                {old.originalFileName} · {formatDateTime(old.uploadedAt)} ·{' '}
                {old.status === 'REPLACED' ? 'replaced' : old.status.toLowerCase()}
              </span>
              {old.status === 'REPLACED' ? (
                <a
                  href={`/api/v1/documents/${old.id}/content`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-primary underline-offset-4 hover:underline"
                >
                  View
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
