/**
 * The small square photo kept in the database beside a student or staff
 * record (`photo_thumbnail`), so a list of forty faces never touches Google
 * Drive (§15). Made once, when the photograph is uploaded; a few kilobytes.
 */
import sharp from 'sharp'

export const THUMBNAIL_SIZE = 128
export const THUMBNAIL_MIME = 'image/jpeg'

/** The document types that are somebody's photograph. */
export const PHOTO_DOCUMENT_TYPE = { STUDENT: 'STUDENT_PHOTO', STAFF: 'STAFF_PHOTO' } as const

export function isPhotoDocumentType(key: string): boolean {
  return key === PHOTO_DOCUMENT_TYPE.STUDENT || key === PHOTO_DOCUMENT_TYPE.STAFF
}

/**
 * A 128×128 JPEG, cropped to the centre, rotated the way the camera meant,
 * with every byte of metadata (location, device) left behind.
 */
export async function makePhotoThumbnail(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const jpeg = await sharp(Buffer.from(bytes))
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer()
  // Prisma's Bytes column wants a plain Uint8Array over its own ArrayBuffer, not a Buffer.
  return new Uint8Array(jpeg)
}
