-- Phase 7: attendance.
--
-- Purely additive: two enums, two tables, their indexes and their foreign keys.
-- Nothing existing is altered or dropped, and no row of student, staff or
-- academic data is touched.

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE');

-- CreateEnum
CREATE TYPE "sheet_status" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance_sheets" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "subject_id" UUID,
    "date" DATE NOT NULL,
    "period" SMALLINT NOT NULL DEFAULT 1,
    "marked_by_staff_id" UUID NOT NULL,
    "status" "sheet_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "cancelled_reason" VARCHAR(255),
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL,
    "remarks" VARCHAR(255),
    "academic_session_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sheets_section_id_date_idx" ON "attendance_sheets"("section_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sheets_academic_session_id_date_idx" ON "attendance_sheets"("academic_session_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sheets_marked_by_staff_id_date_idx" ON "attendance_sheets"("marked_by_staff_id", "date");

-- CreateIndex
--
-- One register per section, per subject, per date, per period.
--
-- NULLS NOT DISTINCT is the whole point of this index and Prisma cannot express
-- it. `subject_id` is NULL for daily roll-call, and PostgreSQL's default is to
-- treat every NULL as different from every other NULL — so without this clause
-- a section could have unlimited daily sheets for the same date, and a teacher
-- opening the register twice would quietly create a second one.
--
-- The index name matches what Prisma expects for @@unique([sectionId,
-- subjectId, date, period]), so `prisma migrate diff` sees no drift: the NULL
-- semantics are invisible to Prisma, which is exactly what we want.
--
-- Requires PostgreSQL 15 or newer. Verified against this project's database
-- (PostgreSQL 18.6) before this migration was written.
CREATE UNIQUE INDEX "attendance_sheets_section_id_subject_id_date_period_key"
  ON "attendance_sheets" ("section_id", "subject_id", "date", "period")
  NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sheets_id_academic_session_id_key" ON "attendance_sheets"("id", "academic_session_id");

-- CreateIndex
CREATE INDEX "attendance_entries_student_id_academic_session_id_date_idx" ON "attendance_entries"("student_id", "academic_session_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_sheet_id_student_id_key" ON "attendance_entries"("sheet_id", "student_id");

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_section_id_academic_session_id_fkey" FOREIGN KEY ("section_id", "academic_session_id") REFERENCES "sections"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_marked_by_staff_id_fkey" FOREIGN KEY ("marked_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_sheet_id_academic_session_id_fkey" FOREIGN KEY ("sheet_id", "academic_session_id") REFERENCES "attendance_sheets"("id", "academic_session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
