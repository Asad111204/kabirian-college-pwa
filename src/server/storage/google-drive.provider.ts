/**
 * Google Drive as the file store.
 *
 * This implements the StorageProvider contract defined in provider.ts. Nothing
 * outside this file knows that Drive is involved, so replacing it later (with
 * S3, or a folder on a college server) means writing one new class.
 *
 * Two things are worth knowing about the `drive.file` scope we use:
 *
 *   - We can only see files *this application created*. `files.list` will never
 *     return the account owner's personal documents, which is exactly the
 *     isolation we want.
 *   - Files created this way are private to the owning account by default. We
 *     never call `permissions.create`, so nothing is ever shared or made public.
 *     Students and staff reach their documents through this application, which
 *     checks who they are first.
 */
import 'server-only'
import { Readable } from 'node:stream'
import { StorageError } from '../api/errors'
import { logger } from '../logger'
import {
  DriveNotConnectedError,
  SETTING_CONNECTION,
  fetchAccountInfo,
  getDriveApi,
  readConnection,
  translateDriveError,
  type DriveConnectionRecord,
} from './google-drive-client'
import { writeSetting } from '../settings/settings-store'
import type {
  StorageDownloadResult,
  StorageProvider,
  StorageUploadInput,
  StorageUploadResult,
} from './provider'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** The folder names created inside the college root. */
export const ROOT_FOLDER_NAME = 'Kabirian College'
export const STUDENTS_FOLDER_NAME = 'Students'
export const STAFF_FOLDER_NAME = 'Staff'

/**
 * Escapes a value for a Drive search query. Drive uses single-quoted strings,
 * so an apostrophe in a name (O'Brien) would end the string early.
 */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Cleans a name before it is sent to Drive. Slashes read as path separators and
 * stray whitespace makes listings confusing. Names come from student codes,
 * people's names and uploaded filenames, so they are cleaned rather than
 * rejected — a student is not turned away because of an apostrophe.
 */
export function safeDriveName(name: string): string {
  const cleaned = name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 120) || 'Unnamed'
}

/**
 * Finds a folder by name inside a parent, or creates it.
 *
 * Drive has no unique constraint on names, so two simultaneous uploads for the
 * same new student could each create a folder. We search first, and after
 * creating we search again and keep the oldest — so a race produces one extra
 * empty folder at worst, never two folders both holding documents.
 */
async function ensureChildFolder(parentId: string, rawName: string): Promise<string> {
  const name = safeDriveName(rawName)
  const api = await getDriveApi()

  const query =
    `mimeType='${FOLDER_MIME}' and name='${escapeQueryValue(name)}' ` +
    `and '${escapeQueryValue(parentId)}' in parents and trashed=false`

  const existing = await api.files.list({
    q: query,
    fields: 'files(id,createdTime)',
    orderBy: 'createdTime',
    pageSize: 2,
    spaces: 'drive',
  })

  const found = existing.data.files?.[0]?.id
  if (found) return found

  const created = await api.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  })

  const createdId = created.data.id
  if (!createdId) throw new StorageError('Google Drive did not return an id for the new folder.')

  // Resolve a possible race: keep the oldest folder of this name.
  const after = await api.files.list({
    q: query,
    fields: 'files(id,createdTime)',
    orderBy: 'createdTime',
    pageSize: 2,
    spaces: 'drive',
  })
  const oldest = after.data.files?.[0]?.id
  if (oldest && oldest !== createdId) {
    logger.warn('Two Drive folders were created at once; keeping the older one.', { name })
    await api.files.delete({ fileId: createdId }).catch(() => undefined)
    return oldest
  }

  return createdId
}

export class GoogleDriveProvider implements StorageProvider {
  readonly name = 'google-drive'

  /**
   * Creates or finds a folder path below the college root folder.
   * `ensureFolder(['Students', 'STU-0001'])` gives that student's folder.
   */
  async ensureFolder(path: string[]): Promise<{ folderId: string }> {
    try {
      const { rootFolderId } = await ensureRootFolders()

      let parentId = rootFolderId
      for (const segment of path) {
        parentId = await ensureChildFolder(parentId, segment)
      }
      return { folderId: parentId }
    } catch (error) {
      throw translateDriveError(error, 'folder creation')
    }
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    try {
      const api = await getDriveApi()
      const body = Buffer.isBuffer(input.body) ? Readable.from(input.body) : input.body

      const created = await api.files.create({
        requestBody: {
          name: safeDriveName(input.fileName),
          parents: [input.folderId],
          // A marker so files created by this app are identifiable in Drive.
          appProperties: { kabirian: '1' },
        },
        media: { mimeType: input.mimeType, body },
        fields: 'id,size',
      })

      const fileId = created.data.id
      if (!fileId) throw new StorageError('Google Drive did not return an id for the uploaded file.')

      return { fileId, size: created.data.size == null ? input.size : Number(created.data.size) }
    } catch (error) {
      throw translateDriveError(error, 'upload')
    }
  }

  async download(fileId: string): Promise<StorageDownloadResult> {
    try {
      const api = await getDriveApi()

      const meta = await api.files.get({ fileId, fields: 'mimeType,size,trashed' })
      if (meta.data.trashed) {
        throw new StorageError('That file has been moved to the Google Drive trash.')
      }

      const response = await api.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
      )

      return {
        stream: response.data as unknown as Readable,
        mimeType: meta.data.mimeType ?? 'application/octet-stream',
        size: meta.data.size == null ? 0 : Number(meta.data.size),
      }
    } catch (error) {
      throw translateDriveError(error, 'download')
    }
  }

  /**
   * 'trash' is the default everywhere in this application: Drive keeps trashed
   * files for 30 days, so a mistaken deletion is recoverable by the account
   * owner. 'permanent' exists for the rare case where a file must really go.
   */
  async delete(fileId: string, mode: 'trash' | 'permanent'): Promise<void> {
    try {
      const api = await getDriveApi()
      if (mode === 'permanent') {
        await api.files.delete({ fileId })
      } else {
        await api.files.update({ fileId, requestBody: { trashed: true } })
      }
    } catch (error) {
      throw translateDriveError(error, 'delete')
    }
  }

  async healthCheck(): Promise<{ ok: true; details: string }> {
    const account = await fetchAccountInfo()
    return {
      ok: true,
      details: account.email
        ? `Connected to Google Drive as ${account.email}.`
        : 'Connected to Google Drive.',
    }
  }
}

/**
 * Creates the college folder structure, once.
 *
 *   Kabirian College/
 *     Students/
 *     Staff/
 *
 * The three folder ids are stored on the connection record, so this is a
 * database read on every call after the first. It is safe to call repeatedly:
 * if the folders exist they are found rather than duplicated, and if an
 * administrator deletes them in Drive the next call recreates them.
 */
export async function ensureRootFolders(): Promise<{
  rootFolderId: string
  studentsFolderId: string
  staffFolderId: string
}> {
  const connection = await readConnection()
  if (!connection) {
    // Not connected is a configuration state (503), not a Drive failure (502).
    // The message has to tell an administrator what to actually do about it.
    throw new DriveNotConnectedError(
      'Google Drive is not connected, so documents cannot be uploaded yet. ' +
        'An administrator can connect it in Settings.',
    )
  }

  if (connection.rootFolderId && connection.studentsFolderId && connection.staffFolderId) {
    return {
      rootFolderId: connection.rootFolderId,
      studentsFolderId: connection.studentsFolderId,
      staffFolderId: connection.staffFolderId,
    }
  }

  // 'root' is Drive's name for the account's My Drive. Because we hold only the
  // drive.file scope, creating here does not give us sight of anything else in it.
  const rootFolderId = await ensureChildFolder('root', ROOT_FOLDER_NAME)
  const studentsFolderId = await ensureChildFolder(rootFolderId, STUDENTS_FOLDER_NAME)
  const staffFolderId = await ensureChildFolder(rootFolderId, STAFF_FOLDER_NAME)

  const updated: DriveConnectionRecord = {
    ...connection,
    rootFolderId,
    studentsFolderId,
    staffFolderId,
  }
  await writeSetting(SETTING_CONNECTION, updated, null, {
    description: 'Google Drive connection details. Contains no secret.',
  })

  logger.info('Google Drive college folders ready', { rootFolderId })

  return { rootFolderId, studentsFolderId, staffFolderId }
}
