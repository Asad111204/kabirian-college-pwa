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
    /**
     * jsdom UI tests on this Windows machine take 2-7 s each when the whole
     * suite runs at once, and a form test that types a long body has been seen
     * to touch 15 s. The default of 5 s turned a slow machine into red tests;
     * 30 s is the machine's ceiling, not a licence for slow code — nothing
     * here legitimately needs more than a few seconds, and CI is faster.
     */
    testTimeout: 30000,
    /**
     * Vitest would otherwise start one worker per core. Three of these files
     * run an in-memory PostgreSQL and a dozen more start jsdom, and on this
     * machine a worker on every core made them time out before they had
     * finished starting whenever anything else was running — red tests with
     * nothing wrong in them. Eight leaves headroom and costs no wall time.
     */
    maxWorkers: 8,
    minWorkers: 1,
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
