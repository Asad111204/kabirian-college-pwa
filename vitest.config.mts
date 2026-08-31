import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    /**
     * The default forks pool cannot start a jsdom worker on this machine — it
     * times out before the environment is ready. Threads start it reliably and
     * run the rest of the suite just as fast.
     */
    pool: 'threads',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
    /**
     * env.ts validates the environment the moment it is imported, so any test
     * that reaches it needs these present. They are placeholders: no test opens
     * a database connection through Prisma, and the attendance schema tests run
     * their own in-memory PostgreSQL.
     */
    env: {
      DATABASE_URL: 'postgresql://localhost:5432/kabirian_test',
      APP_TIMEZONE: 'Asia/Karachi',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Node tests have no client/server split, so neutralise the guard import.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
})
