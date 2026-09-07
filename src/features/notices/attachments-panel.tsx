'use client'

import * as React from 'react'
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { formatBytes, formatDateTime } from '@/lib/format'

export interface AttachmentItem {
  id: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  uploadedAt: string
}

export interface AttachmentTypeOption {
  key: string
  label: string
  /** The `accept` attribute for the file input. */
  accept: string
}

/**
 * The files attached to a notice or an event.
 *
 * Uploads go straight to the owner's endpoint as multipart form data -- the
 * same pipeline as a student's documents, so the bytes are sniffed and the size
 * capped by the document type. Viewing goes through /documents/[id]/content,
 * which re-checks who is asking on every request.
 *
 * Unlike a person's documents, files here do not replace each other: each
 * upload is one more attachment. Removing one keeps the record and moves the
 * file to the Drive trash.
 */
export function AttachmentsPanel({
  endpoint,
  attachments,
  types,
  canManage,
  storageReady,
  onChanged,
  extra,
}: {
  /** POST target, e.g. `/api/v1/notices/<id>/attachments`. */
  endpoint: string
  attachments: AttachmentItem[]
  types: AttachmentTypeOption[]
  canManage: boolean
  /** False when Google Drive is not connected; uploads are then explained, not offered. */
  storageReady: boolean
  onChanged: () => void | Promise<void>
  /** Optional per-attachment action, e.g. "Use as cover" for an event picture. */
  extra?: (attachment: AttachmentItem) => React.ReactNode
}) {
  const [typeKey, setTypeKey] = React.useState(types[0]?.key ?? '')
  const [busy, setBusy] = React.useState(false)
  const [confirm, setConfirm] = React.useState<AttachmentItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const chosen = types.find((t) => t.key === typeKey) ?? types[0]

  async function handleFile(file: File) {
    if (!chosen) return
    setBusy(true)
    const body = new FormData()
    body.append('file', file)
    body.append('documentTypeKey', chosen.key)
    try {
      const response = await fetch(endpoint, { method: 'POST', body, credentials: 'same-origin' })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          (payload as { error?: { message?: string } } | null)?.error?.message ??
          'The upload did not go through.'
        throw new Error(message)
      }
      toast.success(`${file.name} attached.`)
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upload did not go through.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!confirm) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/api/v1/documents/${confirm.id}`)
      toast.success(`${confirm.originalFileName} removed. It stays in the Drive trash for 30 days.`)
      setConfirm(null)
      await onChanged()
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : 'Could not remove that file.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Attachments</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {attachments.length === 0
              ? 'Nothing attached yet.'
              : `${attachments.length} file${attachments.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {canManage && storageReady && chosen ? (
          <div className="flex flex-wrap items-center gap-2">
            {types.length > 1 ? (
              <select
                aria-label="Attachment type"
                value={chosen.key}
                onChange={(e) => setTypeKey(e.target.value)}
                className="h-9 rounded-[var(--radius-control)] border border-border bg-surface px-2 text-sm"
              >
                {types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={chosen.accept}
              className="sr-only"
              id="attachment-file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
              }}
              disabled={busy}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {busy ? 'Uploading…' : `Attach ${chosen.label.toLowerCase()}`}
            </Button>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {canManage && !storageReady ? (
          <Alert variant="warning" className="mb-3">
            Files cannot be attached until an administrator connects Google Drive in Settings.
          </Alert>
        ) : null}

        {attachments.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title="No attachments"
            description={canManage ? 'Attach a circular, a form or a picture.' : 'There is nothing attached.'}
          />
        ) : (
          <ul className="divide-y divide-border">
            {attachments.map((file) => {
              const isImage = file.mimeType.startsWith('image/')
              return (
                <li key={file.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/v1/documents/${file.id}/content`}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium text-primary hover:underline"
                    >
                      {file.originalFileName}
                    </a>
                    <p className="text-xs text-foreground-muted">
                      {formatBytes(file.fileSizeBytes)} · {formatDateTime(file.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {extra?.(file)}
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/api/v1/documents/${file.id}/content?download=1`}>Download</a>
                    </Button>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null)
                          setConfirm(file)
                        }}
                        aria-label={`Remove ${file.originalFileName}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm ? (
          <DialogContent title="Remove this attachment?" description={confirm.originalFileName}>
            <div className="space-y-4">
              {deleteError ? <Alert variant="danger">{deleteError}</Alert> : null}
              <p className="text-sm text-foreground-muted">
                It stops being shown with this notice. The file stays in the Google Drive trash for
                30 days, and the record of who attached it is kept.
              </p>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Removing…' : 'Remove'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  )
}
