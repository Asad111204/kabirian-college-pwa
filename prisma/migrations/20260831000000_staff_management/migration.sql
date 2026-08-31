-- Phase 5: staff records, teacher assignments and section in-charge history.
--
-- Five changes, each with a reason. Existing data is preserved throughout:
-- the college's database currently holds no staff rows, and the demo seed's
-- rows are migrated rather than deleted.

-- ---------------------------------------------------------------------------
-- 1. Designations become reference data instead of free text.
--
-- WHY: `staff.designation` was a plain text column, so "Lecturer", "lecturer"
-- and "Lectrer" could all exist side by side and could never be listed or
-- filtered reliably. Departments were already a table; designations now match,
-- and the Admin can add to the list without a code change.
-- ---------------------------------------------------------------------------

CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "is_teaching" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "designations_name_key" ON "designations"("name");
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("code");

-- Departments gain a display order so both reference lists behave the same.
ALTER TABLE "departments" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Carry over every designation already recorded against a staff member, so no
-- existing record loses its job title.
INSERT INTO "designations" ("id", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), s."designation", 0, true, now(), now()
FROM (SELECT DISTINCT "designation" FROM "staff") AS s
WHERE s."designation" IS NOT NULL AND btrim(s."designation") <> '';

ALTER TABLE "staff" ADD COLUMN "designation_id" UUID;

UPDATE "staff"
   SET "designation_id" = d."id"
  FROM "designations" d
 WHERE d."name" = "staff"."designation";

-- Every staff row now points at a designation, so the column can be required.
ALTER TABLE "staff" ALTER COLUMN "designation_id" SET NOT NULL;
ALTER TABLE "staff" DROP COLUMN "designation";

ALTER TABLE "staff" ADD CONSTRAINT "staff_designation_id_fkey"
  FOREIGN KEY ("designation_id") REFERENCES "designations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "staff_designation_id_idx" ON "staff"("designation_id");
CREATE INDEX "staff_staff_code_idx" ON "staff"("staff_code");

-- ---------------------------------------------------------------------------
-- 2. A fuller employment lifecycle.
--
-- WHY: ACTIVE / ON_LEAVE / LEFT could not distinguish someone who resigned from
-- someone who retired or was dismissed — a distinction the college needs on
-- record. LEFT stays valid so nothing existing breaks.
-- ---------------------------------------------------------------------------

ALTER TYPE "employment_status" ADD VALUE IF NOT EXISTS 'INACTIVE' AFTER 'ON_LEAVE';
ALTER TYPE "employment_status" ADD VALUE IF NOT EXISTS 'RESIGNED';
ALTER TYPE "employment_status" ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TYPE "employment_status" ADD VALUE IF NOT EXISTS 'TERMINATED';

-- ---------------------------------------------------------------------------
-- 3. Staff types that describe what a person actually does.
--
-- WHY: "NON_TEACHING" lumped the principal in with the caretaker.
--
-- Existing NON_TEACHING rows are left untouched: PostgreSQL will not let a
-- newly added enum value be used in the same transaction that adds it, and
-- rewriting rows is not worth a second migration for a value that only demo
-- data uses. NON_TEACHING therefore stays defined but is never offered in the
-- interface, and is displayed as "Non-teaching" where it still appears.
-- ---------------------------------------------------------------------------

ALTER TYPE "staff_type" ADD VALUE IF NOT EXISTS 'ADMINISTRATIVE' AFTER 'TEACHING';
ALTER TYPE "staff_type" ADD VALUE IF NOT EXISTS 'SUPPORT' AFTER 'ADMINISTRATIVE';

-- ---------------------------------------------------------------------------
-- 4. Section in-charge becomes a record with history.
--
-- WHY: `sections.incharge_staff_id` was a single column, so replacing the class
-- teacher in March erased the fact that someone else held it until then. That
-- matters once attendance and results refer back to who was responsible. This
-- is the same reasoning as student enrollments (ADR-056).
-- ---------------------------------------------------------------------------

CREATE TABLE "section_incharges" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" DATE NOT NULL,
    "ended_at" DATE,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "section_incharges_pkey" PRIMARY KEY ("id")
);

-- Carry over any in-charge already set on a section.
INSERT INTO "section_incharges"
  ("id", "section_id", "staff_id", "academic_session_id", "is_active", "assigned_at", "created_at", "updated_at")
SELECT gen_random_uuid(), s."id", s."incharge_staff_id", s."academic_session_id", true, CURRENT_DATE, now(), now()
FROM "sections" s
WHERE s."incharge_staff_id" IS NOT NULL;

DROP INDEX IF EXISTS "sections_incharge_staff_id_idx";
ALTER TABLE "sections" DROP CONSTRAINT IF EXISTS "sections_incharge_staff_id_fkey";
ALTER TABLE "sections" DROP COLUMN "incharge_staff_id";

CREATE INDEX "section_incharges_section_id_is_active_idx" ON "section_incharges"("section_id", "is_active");
CREATE INDEX "section_incharges_staff_id_is_active_idx" ON "section_incharges"("staff_id", "is_active");
CREATE INDEX "section_incharges_academic_session_id_is_active_idx" ON "section_incharges"("academic_session_id", "is_active");

-- At most ONE active in-charge per section. Closed rows are unlimited.
CREATE UNIQUE INDEX "section_incharges_active_section_id_key"
  ON "section_incharges" ("section_id")
  WHERE "is_active";

ALTER TABLE "section_incharges" ADD CONSTRAINT "section_incharges_section_id_academic_session_id_fkey"
  FOREIGN KEY ("section_id", "academic_session_id") REFERENCES "sections"("id", "academic_session_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "section_incharges" ADD CONSTRAINT "section_incharges_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Teacher assignments: uniqueness applies to ACTIVE rows only.
--
-- WHY: the old constraint on (staff, section, subject) was permanent. Once a
-- teacher's assignment was closed, that exact combination could never be
-- created again — so a teacher could not resume a subject they had taught
-- before. Closed rows are history and must not block new work.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "teacher_assignments_staff_id_section_id_subject_id_key";

CREATE UNIQUE INDEX "teacher_assignments_active_staff_id_section_id_subject_id_key"
  ON "teacher_assignments" ("staff_id", "section_id", "subject_id")
  WHERE "is_active";

CREATE INDEX "teacher_assignments_section_id_is_active_idx"
  ON "teacher_assignments" ("section_id", "is_active");
