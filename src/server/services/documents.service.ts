/**
 * Documents: the checklist, uploading, viewing and replacing.
 *
 * Two rules shape this whole file.
 *
 * **The database is the record; Drive only holds bytes.** Every document has a
 * row saying who it belongs to, what type it is, who uploaded it, when, how big
 * it was and its SHA-256 checksum. If the Google account were lost tomorrow we
 * would still know exactly what existed. Drive is never queried to answer a
 * question the database can answer.
 *
 * **Google Drive ids never leave the server.** The browser only ever sees the
 * document's own uuid. Files are streamed through this application, which checks
 * who is asking first, so there is no URL anywhere that works without a login
 * (ADR-012). Nothing is ever shared or made public in Drive.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma'
import { authorize, can, type AuthContext } from '../auth/context'
import { writeAuditLog } from '../audit/audit'
import { ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { env } from '../config/env'
import { logger } from '../logger'
import { getStorageProvider } from '../storage/provider'
import { getScopedSectionIds } from './staff-portal.service'
import { buildStoredFileName, validateUpload } from '../documents/file-validation'
import { decideDocumentAccess } from '../documents/access'
import type { DocumentOwner, DocumentStatus } from '@/generated/prisma/enums'

/** Statuses that count as "the current document" for a person and type. */
const CURRENT_STATUSES: DocumentStatus[] = ['ACTIVE', 'NEEDS_REPLACEMENT']

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
  status: DocumentStatus
  uploadedAt: string
  uploadedByName: string | null
}

/** One row of the checklist: a type, and the current document for it if any. */
export interface DocumentSlot {
  type: DocumentTypeView
  document: DocumentView | null
  /** False when the viewer may see that it exists but not open it. */
  canView: boolean
  history: DocumentView[]
}

/* -------------------------------------------------------------------------- */
/* Access control — the whole of Stage 7 lives in these three functions        */
/* -------------------------------------------------------------------------- */

/**
 * Is this person looking at their own record?
 *
 * The owner of a document may always see it, sensitive or not — it is their own
 * CNIC. Everyone else has to earn access through a permission.
 */
function isOwnRecord(ctx: AuthContext, owner: { studentId?: string | null; staffId?: string | null }): boolean {
  if (owner.studentId && ctx.studentId === owner.studentId) return true
  if (owner.staffId && ctx.staffId === owner.staffId) return true
  return false
}

/**
 * May this teacher see this student at all?
 *
 * Reuses the single scope function from Phase 5 (ADR-062), so "which students
 * can a teacher see" has exactly one answer in the whole application. Adding a
 * second copy of that rule here is precisely how the two would drift apart.
 */
async function teacherCanSeeStudent(ctx: AuthContext, studentId: string): Promise<boolean> {
  if (!ctx.staffId) return false

  const { sectionIds } = await getScopedSectionIds(ctx.staffId)
  if (sectionIds.length === 0) return false

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: 'ACTIVE', sectionId: { in: sectionIds } },
    select: { id: true },
  })
  return enrollment !== null
}

/**
 * Decides whether `ctx` may open a document, and throws if not.
 *
 * The decision itself lives in `documents/access.ts` as a pure function with no
 * database access, so every rule in it is unit-tested. This wrapper does the one
 * lookup that function cannot do for itself — whether the student is in the
 * teacher's sections — and turns a refusal into the right HTTP error.
 */
async function assertCanViewDocument(
  ctx: AuthContext,
  document: { studentId: string | null; staffId: string | null; isSensitive: boolean },
): Promise<void> {
  // Only worth the query when the answer could actually matter.
  const needsScopeCheck = ctx.role === 'STAFF' && ctx.staffId !== null && document.studentId !== null
  const studentInTeachingScope =
    needsScopeCheck && document.studentId ? await teacherCanSeeStudent(ctx, document.studentId) : false

  const decision = decideDocumentAccess({
    viewer: {
      role: ctx.role,
      studentId: ctx.studentId,
      staffId: ctx.staffId,
      canViewDocuments: can(ctx, 'documents.view'),
      canViewSensitive: can(ctx, 'documents.view_sensitive'),
    },
    document,
    studentInTeachingScope,
  })

  if (!decision.allowed) {
    throw new ForbiddenError(decision.reason, {
      userId: ctx.userId,
      role: ctx.role,
      code: decision.code,
      ...(document.studentId ? { studentId: document.studentId } : {}),
    })
  }
}

/**
 * Uploading, replacing and deleting are office work.
 *
 * They require the ADMIN role as well as the matching permission, for the same
 * reason student management does (ADR-058): the permission says *what* someone
 * may do, and the role decides *whose records*. A student cannot upload over
 * their own CNIC scan, and a teacher cannot change a student's documents.
 */
function assertCanManageDocuments(ctx: AuthContext, permission: 'documents.upload' | 'documents.replace' | 'documents.delete'): void {
  if (ctx.role !== 'ADMIN') {
    throw new ForbiddenError('Document management is only available to administrators.', {
      userId: ctx.userId,
      role: ctx.role,
    })
  }
  authorize(ctx, permission)
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDocumentTypes(ownerType: DocumentOwner): Promise<DocumentTypeView[]> {
  const types = await prisma.documentType.findMany({
    where: { ownerType, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return types.map((type) => ({
    key: type.key,
    label: type.label,
    description: type.description,
    isRequired: type.isRequired,
    isSensitive: type.isSensitive,
    allowedMimeTypes: type.allowedMimeTypes,
    maxSizeBytes: type.maxSizeBytes,
    sortOrder: type.sortOrder,
  }))
}

interface DocumentRow {
  id: string
  documentTypeKey: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  status: DocumentStatus
  createdAt: Date
  uploadedBy: { fullName: string | null; username: string } | null
}

function toView(row: DocumentRow): DocumentView {
  return {
    id: row.id,
    documentTypeKey: row.documentTypeKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status,
    uploadedAt: row.createdAt.toISOString(),
    uploadedByName: row.uploadedBy?.fullName ?? row.uploadedBy?.username ?? null,
  }
}

const DOCUMENT_SELECT = {
  id: true,
  documentTypeKey: true,
  originalFileName: true,
  mimeType: true,
  fileSizeBytes: true,
  status: true,
  createdAt: true,
  uploadedBy: { select: { fullName: true, username: true } },
} as const

/**
 * The document checklist for one person.
 *
 * Every active type is listed whether or not a file exists, because the point of
 * the screen is to show what is *missing*. A viewer who may not open a
 * particular document still sees that it exists — that is not a leak, and
 * hiding it would make the checklist lie about what the office holds.
 */
async function listDocumentsFor(
  ctx: AuthContext,
  owner: { ownerType: DocumentOwner; studentId?: string; staffId?: string },
): Promise<DocumentSlot[]> {
  const where = owner.studentId ? { studentId: owner.studentId } : { staffId: owner.staffId }

  const [types, documents] = await Promise.all([
    listDocumentTypes(owner.ownerType),
    prisma.document.findMany({
      where: { ...where, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
      select: DOCUMENT_SELECT,
    }),
  ])

  const own = isOwnRecord(ctx, { studentId: owner.studentId, staffId: owner.staffId })
  const canSeeSensitive = own || can(ctx, 'documents.view_sensitive')

  return types.map((type) => {
    const forType = documents.filter((d) => d.documentTypeKey === type.key)
    const current = forType.find((d) => CURRENT_STATUSES.includes(d.status)) ?? null

    return {
      type,
      document: current ? toView(current) : null,
      canView: !type.isSensitive || canSeeSensitive,
      history: forType.filter((d) => d.id !== current?.id).map(toView),
    }
  })
}

/** The checklist for a student, with the viewer's access already applied. */
export async function getStudentDocuments(ctx: AuthContext, studentId: string): Promise<DocumentSlot[]> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  })
  if (!student) throw new NotFoundError('student')

  if (!isOwnRecord(ctx, { studentId })) {
    authorize(ctx, 'documents.view')
    if (ctx.role !== 'ADMIN') {
      const inScope = await teacherCanSeeStudent(ctx, studentId)
      if (!inScope) {
        throw new ForbiddenError('You can only see documents for students in your own sections.', {
          userId: ctx.userId,
          studentId,
        })
      }
    }
  }

  return listDocumentsFor(ctx, { ownerType: 'STUDENT', studentId })
}

/** The checklist for a staff member. Staff see their own; admins see anyone's. */
export async function getStaffDocuments(ctx: AuthContext, staffId: string): Promise<DocumentSlot[]> {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) throw new NotFoundError('staff record')

  if (!isOwnRecord(ctx, { staffId })) {
    authorize(ctx, 'documents.view')
    if (ctx.role !== 'ADMIN') {
      throw new ForbiddenError('Staff documents are only available to administrators.', {
        userId: ctx.userId,
        role: ctx.role,
      })
    }
  }

  return listDocumentsFor(ctx, { ownerType: 'STAFF', staffId })
}

/* -------------------------------------------------------------------------- */
/* Uploading                                                                  */
/* -------------------------------------------------------------------------- */

interface OwnerRecord {
  ownerType: DocumentOwner
  studentId: string | null
  staffId: string | null
  code: string
  fullName: string
  driveFolderId: string | null
}

async function loadOwner(ownerType: DocumentOwner, ownerId: string): Promise<OwnerRecord> {
  if (ownerType === 'STUDENT') {
    const student = await prisma.student.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true, studentCode: true, fullName: true, driveFolderId: true },
    })
    if (!student) throw new NotFoundError('student')
    return {
      ownerType,
      studentId: student.id,
      staffId: null,
      code: student.studentCode,
      fullName: student.fullName,
      driveFolderId: student.driveFolderId,
    }
  }

  if (ownerType === 'STAFF') {
    const staff = await prisma.staff.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { id: true, staffCode: true, fullName: true, driveFolderId: true },
    })
    if (!staff) throw new NotFoundError('staff record')
    return {
      ownerType,
      studentId: null,
      staffId: staff.id,
      code: staff.staffCode,
      fullName: staff.fullName,
      driveFolderId: staff.driveFolderId,
    }
  }

  throw new ValidationError('Only student and staff documents can be uploaded at the moment.')
}

/**
 * Finds or creates this person's folder in Drive, and remembers its id.
 *
 * The id is stored on the student or staff row, so after the first upload no
 * Drive search is needed at all.
 */
async function ensureOwnerFolder(owner: OwnerRecord): Promise<string> {
  if (owner.driveFolderId) return owner.driveFolderId

  const storage = getStorageProvider()
  const parent = owner.ownerType === 'STUDENT' ? 'Students' : 'Staff'
  const { folderId } = await storage.ensureFolder([parent, `${owner.code} ${owner.fullName}`])

  if (owner.studentId) {
    await prisma.student.update({ where: { id: owner.studentId }, data: { driveFolderId: folderId } })
  } else if (owner.staffId) {
    await prisma.staff.update({ where: { id: owner.staffId }, data: { driveFolderId: folderId } })
  }

  return folderId
}

export interface UploadDocumentInput {
  ownerType: DocumentOwner
  ownerId: string
  documentTypeKey: string
  bytes: Uint8Array
  declaredMimeType: string | null
  originalFileName: string
}

/**
 * Uploads one document, replacing the current one of that type if there is one.
 *
 * The order matters. The file goes to Drive first, then the database rows are
 * written in a single transaction. If that transaction fails, the file we just
 * uploaded is moved to Drive's trash, so a failed upload does not leave a file
 * nothing points at. The reverse order is not possible: the row cannot be
 * written until Drive has given us a file id.
 */
export async function uploadDocument(
  ctx: AuthContext,
  input: UploadDocumentInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<DocumentView> {
  const owner = await loadOwner(input.ownerType, input.ownerId)

  const documentType = await prisma.documentType.findUnique({
    where: { key: input.documentTypeKey },
    select: { key: true, label: true, ownerType: true, isActive: true, allowedMimeTypes: true, maxSizeBytes: true },
  })
  if (!documentType) throw new NotFoundError('document type')
  if (!documentType.isActive) {
    throw new ValidationError(`${documentType.label} is no longer collected.`)
  }
  if (documentType.ownerType !== input.ownerType) {
    throw new ValidationError(`${documentType.label} is not a ${input.ownerType.toLowerCase()} document.`)
  }

  // Is there already a current document of this type? Then this is a replace.
  const existing = await prisma.document.findFirst({
    where: {
      documentTypeKey: documentType.key,
      ...(owner.studentId ? { studentId: owner.studentId } : { staffId: owner.staffId }),
      status: { in: CURRENT_STATUSES },
    },
    select: { id: true, storageFileId: true, originalFileName: true },
  })

  assertCanManageDocuments(ctx, existing ? 'documents.replace' : 'documents.upload')

  // Verified from the file's own bytes — never from what the browser claimed.
  const validated = validateUpload({
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
    allowedMimeTypes: documentType.allowedMimeTypes,
    maxSizeBytes: documentType.maxSizeBytes,
    documentTypeLabel: documentType.label,
  })

  const checksum = createHash('sha256').update(input.bytes).digest('hex')
  const storedFileName = buildStoredFileName({
    ownerCode: owner.code,
    documentTypeKey: documentType.key,
    extension: validated.extension,
  })

  const storage = getStorageProvider()
  const folderId = await ensureOwnerFolder(owner)

  const uploaded = await storage.upload({
    folderId,
    fileName: storedFileName,
    mimeType: validated.mimeType,
    body: Buffer.from(input.bytes),
    size: validated.sizeBytes,
  })

  let created: DocumentRow
  try {
    created = await prisma.$transaction(async (tx) => {
      /**
       * The old row is closed *before* the new one is inserted. A partial unique
       * index allows only one current document per person per type, so
       * inserting first would collide with the row we are about to replace.
       */
      if (existing) {
        await tx.document.update({
          where: { id: existing.id },
          data: { status: 'REPLACED' },
        })
      }

      const row = await tx.document.create({
        data: {
          documentTypeKey: documentType.key,
          studentId: owner.studentId,
          staffId: owner.staffId,
          storageProvider: storage.name === 'google-drive' ? 'google_drive' : storage.name,
          storageFileId: uploaded.fileId,
          storageFolderId: folderId,
          fileName: storedFileName,
          originalFileName: input.originalFileName.slice(0, 255),
          mimeType: validated.mimeType,
          fileSizeBytes: uploaded.size,
          checksumSha256: checksum,
          status: 'ACTIVE',
          uploadedByUserId: ctx.userId,
        },
        select: DOCUMENT_SELECT,
      })

      // Now that the replacement exists, the old row can point at it.
      if (existing) {
        await tx.document.update({
          where: { id: existing.id },
          data: { replacedByDocumentId: row.id },
        })
      }

      /**
       * The audit entry names the file and the person. It deliberately contains
       * no file contents, no Drive id, and no credential of any kind.
       */
      await writeAuditLog(
        ctx,
        {
          action: existing ? 'document.replaced' : 'document.uploaded',
          entityType: 'Document',
          entityId: row.id,
          entityLabel: `${documentType.label} — ${owner.code} ${owner.fullName}`,
          ...(existing ? { before: { originalFileName: existing.originalFileName } } : {}),
          after: {
            documentType: documentType.key,
            originalFileName: row.originalFileName,
            mimeType: row.mimeType,
            fileSizeBytes: row.fileSizeBytes,
          },
          metadata: { ownerType: input.ownerType, ownerCode: owner.code },
          request,
        },
        tx,
      )

      return row
    })
  } catch (error) {
    // The database write failed, so nothing points at the file we just uploaded.
    await storage.delete(uploaded.fileId, 'trash').catch((cleanupError: unknown) => {
      logger.error('Uploaded file could not be cleaned up after a failed save', {
        fileId: uploaded.fileId,
        error: cleanupError,
      })
    })
    throw error
  }

  // Only once the new row is safely committed is the old file trashed.
  if (existing && env.DOCUMENT_REPLACE_POLICY === 'trash') {
    await storage.delete(existing.storageFileId, 'trash').catch((error: unknown) => {
      // The record is already correct; a leftover file in Drive is untidy, not wrong.
      logger.warn('Replaced file could not be moved to the Drive trash', { error })
    })
  }

  return toView(created)
}

/* -------------------------------------------------------------------------- */
/* Viewing and downloading                                                    */
/* -------------------------------------------------------------------------- */

export interface DocumentContent {
  stream: NodeJS.ReadableStream
  mimeType: string
  fileName: string
  originalFileName: string
  sizeBytes: number
}

/**
 * Streams a document's bytes, after checking that this person may see it.
 *
 * The Drive file id is read here and used here; it is never returned. Every
 * request goes through this check, so an old link is not a way in — it is
 * re-authorised on every single view.
 */
export async function getDocumentContent(ctx: AuthContext, documentId: string): Promise<DocumentContent> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      studentId: true,
      staffId: true,
      storageFileId: true,
      fileName: true,
      originalFileName: true,
      mimeType: true,
      fileSizeBytes: true,
      status: true,
      documentType: { select: { isSensitive: true, label: true } },
    },
  })

  if (!document || document.status === 'DELETED' || document.status === 'FAILED') {
    throw new NotFoundError('document')
  }

  await assertCanViewDocument(ctx, {
    studentId: document.studentId,
    staffId: document.staffId,
    isSensitive: document.documentType.isSensitive,
  })

  const storage = getStorageProvider()
  const file = await storage.download(document.storageFileId)

  return {
    stream: file.stream,
    // Trust the type we verified at upload, not whatever Drive reports now.
    mimeType: document.mimeType,
    fileName: document.fileName,
    originalFileName: document.originalFileName,
    sizeBytes: document.fileSizeBytes,
  }
}

/* -------------------------------------------------------------------------- */
/* Deleting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Removes a document.
 *
 * The row is kept and marked DELETED, and the file is moved to Drive's trash
 * where the account owner can recover it for 30 days. A college record of what
 * was held and when is not something to destroy on a single click.
 */
export async function deleteDocument(
  ctx: AuthContext,
  documentId: string,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  assertCanManageDocuments(ctx, 'documents.delete')

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      storageFileId: true,
      originalFileName: true,
      status: true,
      documentType: { select: { label: true } },
      student: { select: { studentCode: true, fullName: true } },
      staff: { select: { staffCode: true, fullName: true } },
    },
  })

  if (!document || document.status === 'DELETED') throw new NotFoundError('document')

  const ownerLabel = document.student
    ? `${document.student.studentCode} ${document.student.fullName}`
    : document.staff
      ? `${document.staff.staffCode} ${document.staff.fullName}`
      : 'unknown'

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    })

    await writeAuditLog(
      ctx,
      {
        action: 'document.deleted',
        entityType: 'Document',
        entityId: document.id,
        entityLabel: `${document.documentType.label} — ${ownerLabel}`,
        before: { originalFileName: document.originalFileName },
        request,
      },
      tx,
    )
  })

  // Trash rather than permanent delete: recoverable for 30 days (ADR-014).
  await getStorageProvider()
    .delete(document.storageFileId, 'trash')
    .catch((error: unknown) => {
      logger.warn('Deleted document could not be moved to the Drive trash', { error })
    })
}

/**
 * Whether uploads can work at all right now.
 *
 * Used by the profile screens to explain *why* the upload button is missing,
 * rather than leaving an administrator wondering. It is a hint for the UI — the
 * upload itself still fails safely if Drive is unavailable.
 */
export async function isDocumentStorageReady(): Promise<boolean> {
  if (env.STORAGE_PROVIDER !== 'google_drive') return false
  const token = await prisma.setting.findUnique({
    where: { key: 'google_drive.refresh_token' },
    select: { key: true },
  })
  return token !== null
}
