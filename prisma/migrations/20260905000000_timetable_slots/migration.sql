-- Phase 10: the weekly master timetable.
--
-- Purely additive: one enum, one table, its indexes and its foreign keys.
-- Nothing existing is altered or dropped, and no row of student, staff,
-- academic, attendance or examination data is touched.
--
-- The clock times are deliberately absent. The college runs a fixed daily
-- period grid, so `period` is an index into PERIODS in
-- src/server/timetable/periods.ts and the times live there -- moving a bell is
-- one edit in a file, not an UPDATE across every lesson of the week. The
-- numbering is the one attendance_sheets.period already uses.
--
-- Only the section clash is a constraint here. A section's lessons are all rows
-- about that section, so an index can hold the rule. A teacher and a room are
-- shared across sections, so their clashes can only be found by reading the
-- rest of the session -- those stay policy checks in
-- src/server/timetable/timetable-policy.ts, and the two secondary indexes below
-- are what make those checks cheap.

-- CreateEnum
CREATE TYPE "day_of_week" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "day_of_week" "day_of_week" NOT NULL,
    "period" SMALLINT NOT NULL,
    "room" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_slots_section_id_academic_session_id_day_of_week__idx" ON "timetable_slots"("section_id", "academic_session_id", "day_of_week", "period");

-- CreateIndex
CREATE INDEX "timetable_slots_staff_id_academic_session_id_day_of_week_pe_idx" ON "timetable_slots"("staff_id", "academic_session_id", "day_of_week", "period");

-- CreateIndex
CREATE INDEX "timetable_slots_academic_session_id_day_of_week_period_idx" ON "timetable_slots"("academic_session_id", "day_of_week", "period");

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_academic_session_id_fkey" FOREIGN KEY ("section_id", "academic_session_id") REFERENCES "sections"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- The section's cell: one lesson per section, per day, per period -- but only
-- among ACTIVE rows.
--
-- WHY partial: a lesson removed from a cell is kept as history with
-- `is_active = false`. A permanent unique index would let that dead row hold
-- the cell for ever, so the timetable could never be rearranged. Same reasoning
-- and same shape as `teacher_assignments_active_..._key` in the Phase 5
-- migration.
--
-- Prisma cannot express a partial index, so the model declares a plain
-- @@index on these columns and this constraint is hand-written. The name
-- carries `_active_` so it is not one Prisma expects to own.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "timetable_slots_active_section_id_day_of_week_period_key"
  ON "timetable_slots" ("section_id", "academic_session_id", "day_of_week", "period")
  WHERE "is_active";

-- ---------------------------------------------------------------------------
-- The teacher's cell: one lesson per teacher, per day, per period.
--
-- WHY a constraint and not only a service check: a teacher's lessons are spread
-- across sections, so the service has to read the whole session's period to see
-- a clash. Between that read and the insert, a second administrator can pass
-- the same check and write the conflicting row. Only the database can settle
-- it, and it settles it whatever order the two writers arrive in.
--
-- The service still checks first, because a constraint violation is not a
-- sentence a person can act on. This is the backstop, not the message.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "timetable_slots_active_staff_id_day_of_week_period_key"
  ON "timetable_slots" ("staff_id", "academic_session_id", "day_of_week", "period")
  WHERE "is_active";

-- ---------------------------------------------------------------------------
-- The room's cell: one lesson per room, per day, per period.
--
-- A functional index, because a room is free text and `Lab 1`, `lab 1` and
-- ` Lab 1 ` are one room -- the same normalisation `roomKey()` applies in
-- timetable-policy.ts. `lower()` and `btrim()` are IMMUTABLE, so they may be
-- indexed.
--
-- Restricted to rows that actually name a room: a lesson with no room yet is
-- not in any place, so it can share a period with anything. The validation
-- schema already trims `room` and turns "" into NULL; the `btrim(...) <> ''`
-- below is there so a row written by any other route cannot slip past.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "timetable_slots_active_room_day_of_week_period_key"
  ON "timetable_slots" ("academic_session_id", "day_of_week", "period", (lower(btrim("room"))))
  WHERE "is_active" AND "room" IS NOT NULL AND btrim("room") <> '';
