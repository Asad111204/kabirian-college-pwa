-- Phase 2: display name for user accounts.
--
-- Why this column is needed: an administrator has no Staff or Student profile,
-- so before this there was nowhere to store their name and the portal showed
-- their username instead. Staff and student accounts keep taking their name
-- from the linked profile record, which stays the single source of truth —
-- this column is only used when there is no profile.
--
-- Safe on existing data: the column is nullable with no default, so every
-- existing row keeps working unchanged.

ALTER TABLE "users" ADD COLUMN "full_name" VARCHAR(120);
