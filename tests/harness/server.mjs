/**
 * A throwaway PostgreSQL on a socket, so the PRODUCTION build can be exercised
 * against a database that is not the college's.
 *
 * Started by run.mjs; never pointed at Neon.
 *
 * `maxConnections: 20` is the whole trick (ADR-120): a page render holds its
 * session lookup open while another query runs, and the default of one
 * connection deadlocks it.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { fileURLToPath } from 'node:url'

const db = await PGlite.create({ dataDir: fileURLToPath(new URL('./pgdata', import.meta.url)) })
const server = new PGLiteSocketServer({
  db,
  host: '127.0.0.1',
  port: 55432,
  maxConnections: 20,
})
// A client that opens a socket and drops it (the port probe, a pool that
// gave up) must not take the whole throwaway server down with it.
process.on('uncaughtException', (error) => {
  if (error && error.code === 'ECONNRESET') return
  console.error(error)
  process.exit(1)
})

await server.start()
console.log('pglite ready on 127.0.0.1:55432')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop()
    await db.close()
    process.exit(0)
  })
}
