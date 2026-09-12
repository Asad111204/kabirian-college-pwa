'use client'

import * as React from 'react'
import { FileUp, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/format'

export interface AdmissionDocumentType {
  key: string
  name: string
  isRequired: boolean
}

/** What the office picked at the counter, waiting for the record to exist. */
export type AdmissionFiles = Record<string, File | undefined>

/**
 * The documents the college asks for, on the admission form.
 *
 * A file cannot be attached to a student who does not exist yet, so these are
 * held here and uploaded the moment the record is created — before the office
 * is told the admission worked. If one fails to upload, the admission still
 * stands and the screen says which file to try again on the student's page,
 * because losing an admission over a photocopy would be the wrong trade.
 */
export function AdmissionDocuments({
  types,
  files,
  onChange,
  disabled = false,
}: {
  types: AdmissionDocumentType[]
  files: AdmissionFiles
  onChange: (files: AdmissionFiles) => void
  disabled?: boolean
}) {
  if (types.length === 0) {
    return <p className="text-sm text-foreground-muted">The school has no document checklist set up yet.</p>
  }

  return (
    <>
      <p className="mb-3 text-sm text-foreground-muted">
        Attach what the family brought to the counter. All of it is optional here — anything missing can be added later on the student&apos;s page.
      </p>

      <ul className="divide-y divide-border">
        {types.map((type) => {
          const chosen = files[type.key]
          const inputId = `admission-doc-${type.key}`
          return (
            <li key={type.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {type.name}
                  {type.isRequired ? <Badge variant="warning">Required</Badge> : null}
                </p>
                {chosen ? (
                  <p className="truncate text-xs text-foreground-muted">
                    {chosen.name} · {formatBytes(chosen.size)}
                  </p>
                ) : (
                  <p className="text-xs text-foreground-subtle">Nothing attached</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {chosen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      const next = { ...files }
                      delete next[type.key]
                      onChange(next)
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Remove
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" disabled={disabled} asChild>
                  <label htmlFor={inputId} className="cursor-pointer">
                    <FileUp className="h-4 w-4" aria-hidden />
                    {chosen ? 'Change' : 'Attach'}
                  </label>
                </Button>
                <input
                  id={inputId}
                  type="file"
                  className="sr-only"
                  disabled={disabled}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    onChange(file ? { ...files, [type.key]: file } : files)
                    // Let the same file be picked again after a removal.
                    e.target.value = ''
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground-subtle">
        <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Files are uploaded once the student record has been created.
      </p>
    </>
  )
}

/**
 * Uploads what was attached, once the student exists.
 *
 * Returns the names of any that did not go up, so the office is told plainly
 * rather than left assuming everything arrived.
 */
export async function uploadAdmissionFiles(studentId: string, files: AdmissionFiles): Promise<string[]> {
  const failed: string[] = []

  for (const [documentTypeKey, file] of Object.entries(files)) {
    if (!file) continue
    const body = new FormData()
    body.append('file', file)
    body.append('documentTypeKey', documentTypeKey)
    try {
      const response = await fetch(`/api/v1/students/${studentId}/documents`, { method: 'POST', body, credentials: 'same-origin' })
      if (!response.ok) failed.push(file.name)
    } catch {
      failed.push(file.name)
    }
  }

  return failed
}
