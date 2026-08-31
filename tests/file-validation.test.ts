import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/server/api/errors'
import {
  buildStoredFileName,
  describeTypes,
  formatSize,
  sniffFileType,
  validateUpload,
} from '@/server/documents/file-validation'

/**
 * File validation.
 *
 * The point of these tests is that the browser's claim about a file's type is
 * never trusted: what matters is what the bytes actually are.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
// An HTML file someone renamed to photo.jpg.
const HTML = new Uint8Array([...Buffer.from('<html><script>alert(1)</script>')])

const IMAGES = ['image/jpeg', 'image/png', 'image/webp']
const SCANS = ['image/jpeg', 'image/png', 'application/pdf']

describe('recognising a file from its bytes', () => {
  it('recognises JPEG, PNG, PDF and WebP', () => {
    expect(sniffFileType(JPEG)).toBe('image/jpeg')
    expect(sniffFileType(PNG)).toBe('image/png')
    expect(sniffFileType(PDF)).toBe('application/pdf')
    expect(sniffFileType(WEBP)).toBe('image/webp')
  })

  it('does not recognise HTML, an empty file, or a truncated header', () => {
    expect(sniffFileType(HTML)).toBeNull()
    expect(sniffFileType(new Uint8Array([]))).toBeNull()
    expect(sniffFileType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })

  it('does not mistake a RIFF file that is not WebP for one', () => {
    const riffWave = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ])
    expect(sniffFileType(riffWave)).toBeNull()
  })
})

describe('validating an upload', () => {
  const base = {
    allowedMimeTypes: IMAGES,
    maxSizeBytes: 2 * 1024 * 1024,
    documentTypeLabel: 'Photograph',
  }

  it('accepts a JPEG photograph', () => {
    const result = validateUpload({ ...base, bytes: JPEG, declaredMimeType: 'image/jpeg' })
    expect(result).toMatchObject({ mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 8 })
  })

  it('accepts a real JPEG even when the browser called it something else', () => {
    const result = validateUpload({
      ...base,
      bytes: JPEG,
      declaredMimeType: 'application/octet-stream',
    })
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('refuses an HTML file renamed to photo.jpg', () => {
    expect(() =>
      validateUpload({ ...base, bytes: HTML, declaredMimeType: 'image/jpeg' }),
    ).toThrow(ValidationError)
  })

  it('refuses a PDF where only images are allowed, and says so', () => {
    expect(() =>
      validateUpload({ ...base, bytes: PDF, declaredMimeType: 'application/pdf' }),
    ).toThrow(/must be a JPEG image, PNG image or WebP image/)
  })

  it('accepts a PDF where scans are allowed', () => {
    const result = validateUpload({
      bytes: PDF,
      declaredMimeType: 'application/pdf',
      allowedMimeTypes: SCANS,
      maxSizeBytes: 10 * 1024 * 1024,
      documentTypeLabel: 'CNIC / B-Form',
    })
    expect(result.mimeType).toBe('application/pdf')
  })

  it('refuses an empty file', () => {
    expect(() =>
      validateUpload({ ...base, bytes: new Uint8Array([]), declaredMimeType: 'image/jpeg' }),
    ).toThrow(/empty/)
  })

  it('refuses a file over the limit and names both sizes', () => {
    const big = new Uint8Array(3 * 1024 * 1024)
    big.set(JPEG, 0)
    expect(() =>
      validateUpload({ ...base, bytes: big, declaredMimeType: 'image/jpeg' }),
    ).toThrow(/3\.0 MB.*2\.0 MB limit for Photograph/)
  })

  it('checks the size before the type, so a huge file is refused cheaply', () => {
    const bigHtml = new Uint8Array(3 * 1024 * 1024)
    bigHtml.set(HTML, 0)
    expect(() =>
      validateUpload({ ...base, bytes: bigHtml, declaredMimeType: 'text/html' }),
    ).toThrow(/over the 2\.0 MB limit/)
  })
})

describe('the name a file is stored under', () => {
  const now = new Date('2026-09-01T14:30:22')

  it('is built from the owner code, type and time — never from what was uploaded', () => {
    expect(
      buildStoredFileName({
        ownerCode: 'STU-0001',
        documentTypeKey: 'STUDENT_PHOTO',
        extension: 'jpg',
        now,
      }),
    ).toBe('STU-0001_STUDENT_PHOTO_20260901-143022.jpg')
  })

  it('strips anything path-like out of the owner code', () => {
    expect(
      buildStoredFileName({
        ownerCode: '../../etc/passwd',
        documentTypeKey: 'STUDENT_PHOTO',
        extension: 'jpg',
        now,
      }),
    ).toBe('etcpasswd_STUDENT_PHOTO_20260901-143022.jpg')
  })
})

describe('messages people have to read', () => {
  it('lists allowed types in plain words', () => {
    expect(describeTypes(SCANS)).toBe('JPEG image, PNG image or PDF')
    expect(describeTypes(['application/pdf'])).toBe('PDF')
  })

  it('formats sizes the way a file listing does', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatSize(15 * 1024 * 1024)).toBe('15 MB')
  })
})
