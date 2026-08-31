-- Phase 4: let a student's enrollment history survive transfers.
--
-- WHY THIS CHANGE
--
-- Until now the database allowed exactly one enrollment row per student per
-- academic session. That meant moving a student from Pre-Medical to ICS Physics
-- in November could only be done by OVERWRITING their existing row — destroying
-- the record of where they had been for the first three months.
--
-- The new rule is: one ACTIVE enrollment per student per session, with any
-- number of closed historical rows alongside it. A transfer now closes the old
-- row (status TRANSFERRED, end date set) and opens a new one, so both remain
-- queryable. Promotion into the next session already worked this way.
--
-- SAFE ON EXISTING DATA
--
-- Every enrollment that exists today is ACTIVE and unique per student+session,
-- so it already satisfies the new partial rules. No rows are read, changed or
-- deleted by this migration.

-- 1. A status for "moved somewhere else inside the same session".
--    Postgres allows this inside a transaction as long as the new value is not
--    used until the transaction commits — which it is not.
ALTER TYPE "enrollment_status" ADD VALUE IF NOT EXISTS 'TRANSFERRED' AFTER 'ACTIVE';

-- 2. Replace "one enrollment per student per session" with
--    "one ACTIVE enrollment per student per session".
DROP INDEX IF EXISTS "student_enrollments_student_id_academic_session_id_key";

CREATE UNIQUE INDEX "student_enrollments_active_student_id_academic_session_id_key"
  ON "student_enrollments" ("student_id", "academic_session_id")
  WHERE "status" = 'ACTIVE';

-- 3. Roll numbers: unique inside a section, but only among ACTIVE enrollments.
--    Previously a departed student kept their roll number reserved forever;
--    now it becomes available again as soon as their enrollment is closed.
DROP INDEX IF EXISTS "student_enrollments_section_roll_key";

-- The index name deliberately contains the column names: when Postgres reports
-- a violation it names the index, and the application turns that into a message
-- against the right form field ("Roll number 101 is already used in …").
CREATE UNIQUE INDEX "student_enrollments_active_section_id_roll_number_key"
  ON "student_enrollments" ("section_id", "roll_number")
  WHERE "roll_number" IS NOT NULL AND "status" = 'ACTIVE';

-- 4. Supporting indexes for the student list: searching by roll number, and
--    reading one student's history in date order.
CREATE INDEX "student_enrollments_student_id_start_date_idx"
  ON "student_enrollments" ("student_id", "start_date");

CREATE INDEX "student_enrollments_roll_number_idx"
  ON "student_enrollments" ("roll_number");
