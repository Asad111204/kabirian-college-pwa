import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { PHOTO_DOCUMENT_TYPE, THUMBNAIL_SIZE, isPhotoDocumentType, makePhotoThumbnail } from '@/server/documents/thumbnail'

/** The thumbnail kept in the database beside a person: small, square, JPEG, no metadata. */
describe('makePhotoThumbnail', () => {
  it('turns a large portrait into a 128×128 JPEG of a few kilobytes', async () => {
    const portrait = await sharp({ create: { width: 900, height: 1400, channels: 3, background: { r: 200, g: 120, b: 90 } } })
      .png()
      .toBuffer()
    const thumb = await makePhotoThumbnail(portrait)
    const meta = await sharp(thumb).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(THUMBNAIL_SIZE)
    expect(meta.height).toBe(THUMBNAIL_SIZE)
    expect(thumb.byteLength).toBeLessThan(20_000)
    expect(meta.exif).toBeUndefined()
  })

  it('accepts a PNG and a JPEG alike, and refuses something that is not an image', async () => {
    const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#336699' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(await makePhotoThumbnail(jpeg)).metadata()).format).toBe('jpeg')
    await expect(makePhotoThumbnail(Buffer.from('%PDF-1.4 not an image'))).rejects.toThrow()
  })

  it('knows which document types are photographs', () => {
    expect(isPhotoDocumentType(PHOTO_DOCUMENT_TYPE.STUDENT)).toBe(true)
    expect(isPhotoDocumentType('STAFF_PHOTO')).toBe(true)
    expect(isPhotoDocumentType('STUDENT_CNIC_BFORM')).toBe(false)
  })
})
