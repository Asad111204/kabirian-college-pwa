import 'server-only'
import type { NextRequest } from 'next/server'
import { ValidationError } from './errors'
import { env } from '../config/env'
import { formatSize } from '../documents/file-validation'

export interface ParsedUpload {
  bytes: Uint8Array
  declaredMimeType: string | null
  originalFileName: string
  documentTypeKey: string
}

/**
 * Reads a document upload out of a multipart form.
 *
 * The absolute ceiling here comes from UPLOAD_MAX_SIZE_MB and exists to stop a
 * huge request being read into memory at all. The real, per-document-type limit
 * is applied afterwards by the service, which knows that a photograph is capped
 * at 2 MB even though a PDF may be 10 MB.
 */
export async function parseDocumentUpload(request: NextRequest): Promise<ParsedUpload> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw new ValidationError('The upload was not sent as a file. Please try again.')
  }

  const hardLimitBytes = env.UPLOAD_MAX_SIZE_MB * 1024 * 1024

  // Reject on the declared length before reading anything into memory.
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > hardLimitBytes * 1.1) {
    throw new ValidationError(`That file is larger than the ${formatSize(hardLimitBytes)} limit.`)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new ValidationError('The uploaded file could not be read. Please try again.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('No file was attached to the upload.')
  }

  if (file.size > hardLimitBytes) {
    throw new ValidationError(
      `That file is ${formatSize(file.size)}, over the ${formatSize(hardLimitBytes)} maximum for any upload.`,
    )
  }

  const documentTypeKey = form.get('documentTypeKey')
  if (typeof documentTypeKey !== 'string' || documentTypeKey.trim() === '') {
    throw new ValidationError('No document type was chosen.')
  }

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    // A claim from the browser, kept only to write a clearer error message.
    declaredMimeType: file.type || null,
    originalFileName: file.name || 'upload',
    documentTypeKey: documentTypeKey.trim(),
  }
}
