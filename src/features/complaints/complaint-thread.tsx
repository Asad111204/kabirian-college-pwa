'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OnlineOnlyButton } from '@/components/pwa/online-only-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { ComplaintDetail } from '@/server/services/complaints.service'

/**
 * One application and the exchange that followed it.
 *
 * The same screen serves the student who wrote it and the office that answers
 * it. What each may do comes from the server on the record itself — `canReply`,
 * `canWithdraw`, `nextStatuses` — so the screen never offers a button the API
 * would refuse.
 */
export function ComplaintThread({ complaint: initial }: { complaint: ComplaintDetail }) {
  const router = useRouter()
  const [complaint, setComplaint] = React.useState(initial)
  const [reply, setReply] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [seen, setSeen] = React.useState(initial.id + initial.lastActivityAt)
  if (initial.id + initial.lastActivityAt !== seen) {
    setSeen(initial.id + initial.lastActivityAt)
    setComplaint(initial)
  }

  /**
   * The exchange keeps itself up to date while it is open.
   *
   * Every five seconds, and only while the tab is being looked at and the
   * application is still open. There is no socket and no push service in this
   * deployment — neither is free to run — so this is a poll, deliberately a
   * small one: one row and its messages, and nothing at all in the background.
   * A reply typed at the other end appears without anybody pressing refresh.
   */
  const open = complaint.status === 'SUBMITTED' || complaint.status === 'IN_REVIEW'
  React.useEffect(() => {
    if (!open) return
    let stopped = false

    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const next = await api.get<ComplaintDetail>(`/api/v1/complaints/${initial.id}`)
        // Never overwrite what somebody is in the middle of doing: the reply
        // box lives in its own state, and only the record itself is replaced.
        if (!stopped) setComplaint(next)
      } catch {
        // Offline, or the application was just closed. The next tick will do.
      }
    }

    const onVisible = () => void poll()
    const timer = setInterval(onVisible, 5000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [initial.id, open])

  async function run(what: () => Promise<ComplaintDetail>, done: string) {
    setBusy(true)
    setError(null)
    try {
      const next = await what()
      setComplaint(next)
      setReply('')
      setNote('')
      toast.success(done)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>{complaint.subject}</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {complaint.categoryLabel} · {complaint.studentName} · {complaint.studentCode}
              {complaint.sectionLabel ? ` · ${complaint.sectionLabel}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-foreground-subtle">Written {formatDateTime(complaint.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {complaint.awaiting === 'OFFICE' ? <Badge variant="warning">With the office</Badge> : null}
            {complaint.awaiting === 'STUDENT' ? <Badge variant="info">Waiting on the student</Badge> : null}
            <Badge variant={complaint.statusTone}>{complaint.statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-foreground">{complaint.body}</p>
        </CardContent>
      </Card>

      {complaint.messages.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {complaint.messages.map((message) => (
            <li key={message.id}>
              <Card className={cn('p-4', message.byOffice ? 'border-primary/40 bg-primary/5' : '')}>
                <p className="mb-1 text-xs font-medium text-foreground-muted">
                  {message.authorName} · {formatDateTime(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <Alert variant="danger" className="mb-4" title="Not saved">
          {error}
        </Alert>
      ) : null}

      {complaint.closedReason ? (
        <Alert variant="info" className="mb-4">
          {complaint.closedReason}
        </Alert>
      ) : null}

      {complaint.canReply ? (
        <Card className="mb-4 p-4">
          <Field label="Add a message" htmlFor="complaint-reply">
            <Textarea id="complaint-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={4000} placeholder="Write your reply…" />
          </Field>
          <div className="mt-3 flex justify-end">
            <OnlineOnlyButton
              onClick={() => run(() => api.post<ComplaintDetail>(`/api/v1/complaints/${complaint.id}/replies`, { body: reply }), 'Your message has been added.')}
              loading={busy}
              disabled={reply.trim().length < 2}
            >
              <Send className="h-4 w-4" aria-hidden />
              Send
            </OnlineOnlyButton>
          </div>
        </Card>
      ) : null}

      {complaint.canChangeStatus ? (
        <Card className="mb-4 p-4">
          <Field
            label="Closing message"
            htmlFor="complaint-note"
            hint="Sent to the student as the office's answer. Optional, but an application resolved without a word is an application nobody understands."
          >
            <Textarea id="complaint-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {complaint.nextStatuses.map((next) => (
              <OnlineOnlyButton
                key={next.value}
                variant={next.value === 'RESOLVED' ? 'primary' : 'secondary'}
                loading={busy}
                onClick={() =>
                  run(
                    () => api.patch<ComplaintDetail>(`/api/v1/complaints/${complaint.id}`, { status: next.value, note: note.trim() || undefined }),
                    `Marked "${next.label}".`,
                  )
                }
              >
                Mark {next.label.toLowerCase()}
              </OnlineOnlyButton>
            ))}
          </div>
        </Card>
      ) : null}

      {complaint.canWithdraw ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            loading={busy}
            onClick={() => run(() => api.post<ComplaintDetail>(`/api/v1/complaints/${complaint.id}/withdraw`, {}), 'Your application has been withdrawn.')}
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            Withdraw this application
          </Button>
        </div>
      ) : null}
    </>
  )
}
