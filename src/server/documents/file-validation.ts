/**
 * Checking an uploaded file before it is allowed anywhere near Drive.
 *
 * The browser tells us a file's type in the `Content-Type` of the multipart
 * part. That value is chosen by whatever sent the request, so it is a claim,
 * not a fact: renaming `payload.html` to `photo.jpg` changes it. Every rule here
 * is therefore applied to the file's own bytes.
 *
 * This file is deliberately free of database and Drive imports, so it can be
 * unit-tested on its own.
 */
import { ValidationError } from '../api/errors'

/** The file types the college accepts. Anything else is refused outright. */
export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

interface Signature {
  type: SniffedType
  /** Byte values the file must start with. `null` matches any byte. */
  magic: Array<number | null>
  /** Extra bytes that must appear at a fixed offset (WebP needs this). */
  at?: { offset: number; bytes: number[] }
}

const SIGNATURES: Signature[] = [
  // JPEG: every variant starts FF D8 FF.
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  // PNG: the 8-byte signature from the specification.
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // PDF: "%PDF-".
  { type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // WebP: "RIFF" then four size bytes then "WEBP".
  {
    type: 'image/webp',
    magic: [0x52, 0x49, 0x46, 0x46],
    at: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  },
]

/**
 * Reads the file's leading bytes and returns what it actually is, or null if it
 * is not a type we accept.
 */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  for (const signature of SIGNATURES) {
    if (bytes.length < signature.magic.length) continue

    const headMatches = signature.magic.every(
      (expected, index) => expected === null || bytes[index] === expected,
    )
    if (!headMatches) continue

    if (signature.at) {
      const { offset, bytes: expectedBytes } = signature.at
      if (bytes.length < offset + expectedBytes.length) continue
      const tailMatches = expectedBytes.every((expected, i) => bytes[offset + i] === expected)
      if (!tailMatches) continue
    }

    return signature.type
  }

  return null
}

/** The extension we give a file, chosen from what the bytes really are. */
export function extensionFor(type: SniffedType): string {
  switch (type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
  }
}

const HUMAN_NAMES: Record<SniffedType, string> = {
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'application/pdf': 'PDF',
}

/** Turns a list of MIME types into something readable in an error message. */
export function describeTypes(types: readonly string[]): string {
  const names = types.map((type) => HUMAN_NAMES[type as SniffedType] ?? type)
  if (names.length <= 1) return names[0] ?? 'nothing'
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

export interface ValidatedFile {
  /** The type proved by the file's own bytes. */
  mimeType: SniffedType
  extension: string
  sizeBytes: number
}

/**
 * Applies every rule for one document type, and explains any failure in terms
 * the person uploading can act on.
 */
export function validateUpload(args: {
  bytes: Uint8Array
  /** What the browser claimed. Used only to give a better error message. */
  declaredMimeType: string | null
  allowedMimeTypes: readonly string[]
  maxSizeBytes: number
  documentTypeLabel: string
}): ValidatedFile {
  const { bytes, declaredMimeType, allowedMimeTypes, maxSizeBytes, documentTypeLabel } = args

  if (bytes.length === 0) {
    throw new ValidationError('That file is empty. Please choose a different file.')
  }

  if (bytes.length > maxSizeBytes) {
    throw new ValidationError(
      `That file is ${formatSize(bytes.length)}, which is over the ${formatSize(maxSizeBytes)} limit for ${documentTypeLabel}. ` +
        'Please scan it at a lower quality, or use a smaller photo.',
    )
  }

  const actualType = sniffFileType(bytes)

  if (!actualType) {
    throw new ValidationError(
      `That file is not a ${describeTypes(allowedMimeTypes)}. ` +
        (declaredMimeType && declaredMimeType !== 'application/octet-stream'
          ? `It was sent as "${declaredMimeType}", but its contents are something else.`
          : 'Please check you selected the right file.'),
    )
  }

  if (!allowedMimeTypes.includes(actualType)) {
    throw new ValidationError(
      `${documentTypeLabel} must be a ${describeTypes(allowedMimeTypes)}. ` +
        `You uploaded a ${HUMAN_NAMES[actualType]}.`,
    )
  }

  return { mimeType: actualType, extension: extensionFor(actualType), sizeBytes: bytes.length }
}

/** Sizes in error messages, in the units people use for files. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * Builds the name the file is stored under.
 *
 * The name the person chose is kept in the database for display, but is never
 * used to build the stored name: it can contain anything at all, and a
 * predictable name makes the Drive folder readable by a human.
 *
 * Example: `STU-0001_STUDENT_PHOTO_20260901-143022.jpg`
 */
export function buildStoredFileName(args: {
  ownerCode: string
  documentTypeKey: string
  extension: string
  now?: Date
}): string {
  const now = args.now ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  const safeCode = args.ownerCode.replace(/[^A-Za-z0-9_-]/g, '')
  return `${safeCode}_${args.documentTypeKey}_${stamp}.${args.extension}`
}
