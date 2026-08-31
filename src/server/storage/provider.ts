/**
 * File storage abstraction.
 *
 * The database is the source of truth for structured data; actual files (student
 * photos, CNIC scans, CVs) live in Google Drive. Everything in the application
 * talks to this interface instead of to Google directly, so the provider can be
 * swapped later without touching the document logic (ADR-012).
 *
 * STATUS: Phase 6 implements GoogleDriveProvider. When STORAGE_PROVIDER is
 * "none" the unconfigured provider is used instead, and every method fails
 * loudly with a clear message — nothing here ever pretends to store a file.
 */
import 'server-only'
import type { Readable } from 'node:stream'
import { NotConfiguredError } from '../api/errors'
import { env } from '../config/env'
import { GoogleDriveProvider } from './google-drive.provider'

export interface StorageUploadInput {
  folderId: string
  fileName: string
  mimeType: string
  body: Buffer | Readable
  size: number
}

export interface StorageUploadResult {
  fileId: string
  size: number
}

export interface StorageDownloadResult {
  stream: Readable
  mimeType: string
  size: number
}

export interface StorageProvider {
  readonly name: string

  /** Creates (or finds) a folder path such as ['Students', 'STU-0001']. */
  ensureFolder(path: string[]): Promise<{ folderId: string }>

  upload(input: StorageUploadInput): Promise<StorageUploadResult>

  download(fileId: string): Promise<StorageDownloadResult>

  /** 'trash' keeps the file recoverable for 30 days; 'permanent' does not. */
  delete(fileId: string, mode: 'trash' | 'permanent'): Promise<void>

  /** Used by the admin "storage status" panel. Throws when misconfigured. */
  healthCheck(): Promise<{ ok: true; details: string }>
}

const NOT_CONFIGURED_MESSAGE =
  'File storage is not configured yet. Google Drive integration is added in Phase 6 — ' +
  'set STORAGE_PROVIDER=google_drive and the GOOGLE_* variables in .env once it is available.'

/**
 * Used until Phase 6. Every method fails with an explanatory error instead of
 * silently doing nothing, so a missing integration can never look like it worked.
 */
class UnconfiguredStorageProvider implements StorageProvider {
  readonly name = 'not-configured'

  async ensureFolder(): Promise<{ folderId: string }> {
    throw new NotConfiguredError(NOT_CONFIGURED_MESSAGE)
  }
  async upload(): Promise<StorageUploadResult> {
    throw new NotConfiguredError(NOT_CONFIGURED_MESSAGE)
  }
  async download(): Promise<StorageDownloadResult> {
    throw new NotConfiguredError(NOT_CONFIGURED_MESSAGE)
  }
  async delete(): Promise<void> {
    throw new NotConfiguredError(NOT_CONFIGURED_MESSAGE)
  }
  async healthCheck(): Promise<{ ok: true; details: string }> {
    throw new NotConfiguredError(NOT_CONFIGURED_MESSAGE)
  }
}

let cachedProvider: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider

  switch (env.STORAGE_PROVIDER) {
    case 'google_drive':
      cachedProvider = new GoogleDriveProvider()
      return cachedProvider
    case 'none':
    default:
      cachedProvider = new UnconfiguredStorageProvider()
      return cachedProvider
  }
}

export function isStorageConfigured(): boolean {
  return env.STORAGE_PROVIDER !== 'none'
}
