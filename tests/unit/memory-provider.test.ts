import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { InMemoryStorageProvider } from '@/server/storage/memory.provider'

/** The storage provider tests and the harness run on: a Map, never a disk or a network. */
describe('InMemoryStorageProvider', () => {
  it('stores, streams back and deletes a file, and counts what it holds', async () => {
    const storage = new InMemoryStorageProvider({ files: new Map(), folders: new Map() })
    const { folderId } = await storage.ensureFolder(['Students', 'STU-0001 Ali Raza'])
    expect((await storage.ensureFolder(['Students', 'STU-0001 Ali Raza'])).folderId).toBe(folderId)

    const { fileId, size } = await storage.upload({ folderId, fileName: 'photo.png', mimeType: 'image/png', body: Buffer.from('hello'), size: 5 })
    expect(size).toBe(5)
    expect(storage.size).toBe(1)

    const download = await storage.download(fileId)
    const chunks: Buffer[] = []
    for await (const c of download.stream) chunks.push(Buffer.from(c as Buffer))
    expect(Buffer.concat(chunks).toString()).toBe('hello')
    expect(download.mimeType).toBe('image/png')

    await storage.delete(fileId, 'trash')
    expect(storage.size).toBe(0)
    await expect(storage.download(fileId)).rejects.toThrow()
    await storage.delete(fileId, 'permanent')
    await storage.delete('never-existed', 'permanent')
  })

  it('streams a file the way the content route reads it: through Readable.toWeb into a Response', async () => {
    const storage = new InMemoryStorageProvider({ files: new Map(), folders: new Map() })
    const { folderId } = await storage.ensureFolder(['Notices', '2026'])
    const pdf = Buffer.from('%PDF-1.4 tiny')
    const { fileId } = await storage.upload({ folderId, fileName: 'a.pdf', mimeType: 'application/pdf', body: pdf, size: pdf.byteLength })
    const download = await storage.download(fileId)
    const body = await new Response(Readable.toWeb(download.stream as Readable) as ReadableStream).arrayBuffer()
    expect(Buffer.from(body).toString()).toBe('%PDF-1.4 tiny')
  })

  it('reports itself healthy and by name', async () => {
    const storage = new InMemoryStorageProvider({ files: new Map(), folders: new Map() })
    expect(storage.name).toBe('memory')
    expect((await storage.healthCheck()).ok).toBe(true)
  })
})
