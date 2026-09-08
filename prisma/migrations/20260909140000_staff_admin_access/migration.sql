-- Phase 24: a staff member who is also an admin.
--
-- One account, both portals, with a switcher. Deliberately the narrow version
-- the college asked for: a STAFF account may additionally hold office access.
-- Students stay single-role, and an ADMIN account is unchanged.
--
-- Two columns, both defaulted, so every existing account and every existing
-- session keeps behaving exactly as it does today.

-- Whether this staff account may also work in the office portal.
ALTER TABLE "users" ADD COLUMN "admin_access" BOOLEAN NOT NULL DEFAULT false;

-- Only a staff account can hold it. An ADMIN already has the office, and a
-- student never does; the database refuses the combination rather than
-- trusting every future code path to remember.
ALTER TABLE "users" ADD CONSTRAINT "users_admin_access_is_staff_only"
  CHECK ("admin_access" = false OR "role" = 'STAFF');

-- Which portal this one device is currently working in. NULL means the
-- account's own role, which is what every existing session means.
ALTER TABLE "sessions" ADD COLUMN "active_role" "user_role";
