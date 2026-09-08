/**
 * An in-memory storage provider for tests and the harness (ADR-032 promised
 * one). Files live in a Map for the life of the process; nothing touches a
 * disk or a network. `STORAGE_PROVIDER=memory` selects it — never in
 * production, where the college's Google Drive is the only place files go.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { NotFoundError } from '../api/errors'
import type { StorageDownloadResult, StorageProvider, StorageUploadInput, StorageUploadResult } from './provider'

interface StoredFile {
  bytes: Buffer
  mimeType: string
  fileName: string
  folderId: string
  trashed: boolean
}

interface MemoryStore {
  files: Map<string, StoredFile>
  folders: Map<string, string>
}

/**
 * One store per process, on `globalThis`: the production build may bundle
 * this module into several route chunks, and a file uploaded through one
 * route must be there when another route streams it back.
 */
function sharedStore(): MemoryStore {
  const g = globalThis as { __kcMemoryStorage?: MemoryStore }
  g.__kcMemoryStorage ??= { files: new Map(), folders: new Map() }
  return g.__kcMemoryStorage
}

export class InMemoryStorageProvider implements StorageProvider {
  readonly name = 'memory'
  private readonly files: Map<string, StoredFile>
  private readonly folders: Map<string, string>

  constructor(store: MemoryStore = sharedStore()) {
    this.files = store.files
    this.folders = store.folders
  }

  async ensureFolder(path: string[]): Promise<{ folderId: string }> {
    const key = path.join('/')
    let id = this.folders.get(key)
    if (!id) {
      id = `folder-${randomUUID()}`
      this.folders.set(key, id)
    }
    return { folderId: id }
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const bytes = Buffer.isBuffer(input.body) ? Buffer.from(input.body) : await readAll(input.body)
    const fileId = `file-${randomUUID()}`
    this.files.set(fileId, { bytes, mimeType: input.mimeType, fileName: input.fileName, folderId: input.folderId, trashed: false })
    return { fileId, size: bytes.byteLength }
  }

  async download(fileId: string): Promise<StorageDownloadResult> {
    const file = this.files.get(fileId)
    if (!file || file.trashed) throw new NotFoundError('file')
    // A plain byte stream (not object mode), exactly what Drive's HTTP stream
    // is, so `Readable.toWeb` in the content route treats both the same.
    const bytes = file.bytes
    const stream = new Readable({
      read() {
        this.push(bytes)
        this.push(null)
      },
    })
    return { stream, mimeType: file.mimeType, size: bytes.byteLength }
  }

  async delete(fileId: string, mode: 'trash' | 'permanent'): Promise<void> {
    const file = this.files.get(fileId)
    if (!file) return
    if (mode === 'permanent') this.files.delete(fileId)
    else file.trashed = true
  }

  async healthCheck(): Promise<{ ok: true; details: string }> {
    return { ok: true, details: `in-memory storage, ${this.files.size} file(s)` }
  }

  /** For tests: what is held right now. */
  get size(): number {
    return [...this.files.values()].filter((f) => !f.trashed).length
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
  return Buffer.concat(chunks)
}
