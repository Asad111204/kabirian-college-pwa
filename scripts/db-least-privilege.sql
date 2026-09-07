-- Least-privilege database role for the running application (ADR-163).
--
-- Two roles, two connection strings:
--   * the owner role Neon created (DATABASE_DIRECT_URL) — runs migrations,
--     backups and restores: it may create and alter tables;
--   * kabirian_app (DATABASE_URL) — what the server runs as: it may read and
--     write rows in the tables that exist, and nothing else. It cannot drop or
--     alter a table, create one, or touch another schema.
--
-- Run once, as the owner role, in Neon's SQL editor or psql, after replacing
-- the password (use a long random one, e.g. `openssl rand -base64 24`).
-- Re-running is safe. After every new migration, the DEFAULT PRIVILEGES line
-- below has already granted the new tables to the app role.
--
-- Then set DATABASE_URL on the host to the pooled connection string with
-- kabirian_app as the user, and keep DATABASE_DIRECT_URL for `npm run
-- db:migrate` on your own machine only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kabirian_app') THEN
    CREATE ROLE kabirian_app LOGIN PASSWORD 'REPLACE-WITH-A-LONG-RANDOM-PASSWORD';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE neondb TO kabirian_app;          -- change neondb if your database is named differently
GRANT USAGE ON SCHEMA public TO kabirian_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kabirian_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kabirian_app;

-- Tables created by future migrations (run as the owner) get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kabirian_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kabirian_app;

-- Deliberately NOT granted: CREATE on the schema, TRUNCATE, REFERENCES,
-- TRIGGER, and anything on _prisma_migrations beyond reading it.
REVOKE INSERT, UPDATE, DELETE ON _prisma_migrations FROM kabirian_app;
