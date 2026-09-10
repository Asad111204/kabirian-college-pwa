-- Phase 31: a lesson covers sections, not a section.
--
-- The college's own printed timetable does two things this table could not
-- hold. Its columns are combinations -- "1st Year Girls Bio/Math" is one
-- column, one teacher and one room, but two of this system's sections sitting
-- together. And its cells are sometimes several lessons at once -- "Ch / Comp
-- / Isl(E)" with three teachers, the students split by what they take.
--
-- The old shape refused both. A lesson belonged to exactly one section, so a
-- combined class had to be written as two lessons -- and then the teacher's
-- own unique index called it a clash, because one teacher cannot be in two
-- places. The section's unique index refused the second half: one lesson per
-- section per period, full stop.
--
-- So a lesson now belongs to a session and lists the sections it covers.
-- A combined class is ONE row across three sections, which is both the truth
-- and the thing that makes the teacher's index work again. A split is two
-- rows over the same section, which the new index allows as long as the two
-- are different subjects.
--
-- Nothing is lost. Every existing lesson becomes a lesson over exactly one
-- section, which is what it already was.

-- ---------------------------------------------------------------------------
-- 1. The break belongs to the campus.
--
-- One bell grid, two campuses that do not stop together: the girls break at
-- 11:10 and the boys teach through it and break at 11:40. NULL keeps the
-- college-wide default in periods.ts, so a college with one break sets nothing.
-- ---------------------------------------------------------------------------

ALTER TABLE "divisions" ADD COLUMN "break_period" SMALLINT;

-- ---------------------------------------------------------------------------
-- 2. Which sections a lesson covers.
-- ---------------------------------------------------------------------------

CREATE TABLE "timetable_slot_sections" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "day_of_week" "day_of_week" NOT NULL,
    "period" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_slot_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timetable_slot_sections_slot_id_section_id_key"
  ON "timetable_slot_sections"("slot_id", "section_id");

CREATE INDEX "timetable_slot_sections_section_id_academic_session_id_day__idx"
  ON "timetable_slot_sections"("section_id", "academic_session_id", "day_of_week", "period");

ALTER TABLE "timetable_slot_sections" ADD CONSTRAINT "timetable_slot_sections_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timetable_slot_sections" ADD CONSTRAINT "timetable_slot_sections_section_id_academic_session_id_fkey"
  FOREIGN KEY ("section_id", "academic_session_id") REFERENCES "sections"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Every lesson there is becomes a lesson over its own one section.
--
-- Before the column is dropped, so nothing has to be reconstructed afterwards.
-- gen_random_uuid() is in core PostgreSQL from 13; this deployment is 18.
-- ---------------------------------------------------------------------------

INSERT INTO "timetable_slot_sections"
  ("id", "slot_id", "section_id", "academic_session_id", "subject_id", "day_of_week", "period", "is_active", "created_at")
SELECT
  gen_random_uuid(), s."id", s."section_id", s."academic_session_id", s."subject_id", s."day_of_week", s."period", s."is_active", s."created_at"
FROM "timetable_slots" s;

-- ---------------------------------------------------------------------------
-- 4. A section may be in several lessons at once, but not twice in the same
--    subject.
--
-- The rule the old index held was "one lesson per section per period", which
-- is exactly what an elective split breaks. This is the weakest rule that
-- still catches a genuine duplicate. Partial, for the same reason every other
-- index here is: a lesson removed from a cell stays as history with
-- is_active = false, and a dead row must not hold a cell for ever.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "timetable_slot_sections_active_section_day_period_subject_key"
  ON "timetable_slot_sections" ("section_id", "academic_session_id", "day_of_week", "period", "subject_id")
  WHERE "is_active";

-- ---------------------------------------------------------------------------
-- 5. The lesson stops belonging to one section.
--
-- The old section index goes with the column. The teacher's and the room's
-- indexes are untouched and now mean what they always should have: one
-- teacher, one lesson, one period -- however many sections are sitting in it.
-- ---------------------------------------------------------------------------

DROP INDEX "timetable_slots_active_section_id_day_of_week_period_key";
DROP INDEX "timetable_slots_section_id_academic_session_id_day_of_week__idx";

ALTER TABLE "timetable_slots" DROP CONSTRAINT "timetable_slots_section_id_academic_session_id_fkey";
ALTER TABLE "timetable_slots" DROP COLUMN "section_id";

-- The session was only reachable through the section's composite key before.
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_academic_session_id_fkey"
  FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
