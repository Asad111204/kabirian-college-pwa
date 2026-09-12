-- Phase 8: exams, marks and results.
--
-- Purely additive: five enums, eight tables, their indexes, foreign keys and
-- check constraints. No existing table is altered and no existing row is
-- touched.

-- CreateEnum
CREATE TYPE "exam_status" AS ENUM ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "mark_sheet_status" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "mark_status" AS ENUM ('PENDING', 'ENTERED', 'ABSENT');

-- CreateEnum
CREATE TYPE "result_outcome" AS ENUM ('PASS', 'FAIL', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "result_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "exam_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "exam_type_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" "exam_status" NOT NULL DEFAULT 'DRAFT',
    "description" VARCHAR(500),
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "program_id" UUID,
    "exam_date" DATE,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "room" VARCHAR(50),
    "max_marks" DECIMAL(6,2) NOT NULL,
    "passing_percentage" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" UUID NOT NULL,
    "grade_scale_id" UUID NOT NULL,
    "grade" VARCHAR(5) NOT NULL,
    "min_percentage" DECIMAL(5,2) NOT NULL,
    "max_percentage" DECIMAL(5,2) NOT NULL,
    "remarks" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_mark_sheets" (
    "id" UUID NOT NULL,
    "exam_paper_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "status" "mark_sheet_status" NOT NULL DEFAULT 'DRAFT',
    "entered_by_staff_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "published_by_user_id" UUID,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_mark_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" UUID NOT NULL,
    "mark_sheet_id" UUID NOT NULL,
    "exam_paper_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "mark_status" NOT NULL DEFAULT 'PENDING',
    "obtained_marks" DECIMAL(6,2),
    "remarks" VARCHAR(255),
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "academic_session_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "academic_group_id" UUID NOT NULL,
    "student_code" VARCHAR(20) NOT NULL,
    "student_name" VARCHAR(120) NOT NULL,
    "father_name" VARCHAR(120),
    "roll_number" VARCHAR(20),
    "exam_name" VARCHAR(120) NOT NULL,
    "exam_type_name" VARCHAR(60) NOT NULL,
    "session_name" VARCHAR(20) NOT NULL,
    "class_name" VARCHAR(100) NOT NULL,
    "division_name" VARCHAR(60) NOT NULL,
    "program_name" VARCHAR(80) NOT NULL,
    "section_name" VARCHAR(20) NOT NULL,
    "total_max_marks" DECIMAL(8,2) NOT NULL,
    "total_obtained_marks" DECIMAL(8,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "grade" VARCHAR(5),
    "outcome" "result_outcome" NOT NULL,
    "subject_breakdown" JSONB NOT NULL,
    "position" INTEGER,
    "position_scope" VARCHAR(20),
    "grade_scale_id" UUID,
    "grade_scale_name" VARCHAR(60),
    "status" "result_status" NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "published_by_user_id" UUID,
    "correction_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_types_name_key" ON "exam_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "exam_types_code_key" ON "exam_types"("code");

-- CreateIndex
CREATE INDEX "exams_academic_session_id_status_idx" ON "exams"("academic_session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exams_academic_session_id_name_key" ON "exams"("academic_session_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exams_id_academic_session_id_key" ON "exams"("id", "academic_session_id");

-- CreateIndex
CREATE INDEX "exam_papers_exam_id_class_id_idx" ON "exam_papers"("exam_id", "class_id");

-- CreateIndex
CREATE INDEX "exam_papers_exam_id_exam_date_idx" ON "exam_papers"("exam_id", "exam_date");

-- CreateIndex
-- One paper per exam, class, subject and program.
--
-- NULLS NOT DISTINCT is the point of this index and Prisma cannot express it.
-- `program_id` is NULL for a paper that covers every program in the class, and
-- PostgreSQL treats each NULL as distinct by default -- so without this clause
-- the same paper could be created over and over. Same rule, same reason as the
-- daily attendance register (ADR-080). Requires PostgreSQL 15+.
CREATE UNIQUE INDEX "exam_papers_exam_id_class_id_subject_id_program_id_key"
  ON "exam_papers" ("exam_id", "class_id", "subject_id", "program_id")
  NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_id_academic_session_id_key" ON "exam_papers"("id", "academic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_scales_name_key" ON "grade_scales"("name");

-- CreateIndex
CREATE INDEX "grade_bands_grade_scale_id_sort_order_idx" ON "grade_bands"("grade_scale_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_scale_id_grade_key" ON "grade_bands"("grade_scale_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_scale_id_min_percentage_key" ON "grade_bands"("grade_scale_id", "min_percentage");

-- CreateIndex
CREATE INDEX "exam_mark_sheets_section_id_status_idx" ON "exam_mark_sheets"("section_id", "status");

-- CreateIndex
CREATE INDEX "exam_mark_sheets_exam_paper_id_status_idx" ON "exam_mark_sheets"("exam_paper_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_mark_sheets_exam_paper_id_section_id_key" ON "exam_mark_sheets"("exam_paper_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_mark_sheets_id_exam_paper_id_key" ON "exam_mark_sheets"("id", "exam_paper_id");

-- CreateIndex
CREATE INDEX "marks_student_id_idx" ON "marks"("student_id");

-- CreateIndex
CREATE INDEX "marks_mark_sheet_id_status_idx" ON "marks"("mark_sheet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marks_exam_paper_id_student_id_key" ON "marks"("exam_paper_id", "student_id");

-- CreateIndex
CREATE INDEX "results_exam_id_section_id_idx" ON "results"("exam_id", "section_id");

-- CreateIndex
CREATE INDEX "results_exam_id_academic_group_id_total_obtained_marks_idx" ON "results"("exam_id", "academic_group_id", "total_obtained_marks" DESC);

-- CreateIndex
CREATE INDEX "results_student_id_status_idx" ON "results"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "results_exam_id_student_id_version_key" ON "results"("exam_id", "student_id", "version");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_exam_id_academic_session_id_fkey" FOREIGN KEY ("exam_id", "academic_session_id") REFERENCES "exams"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_mark_sheets" ADD CONSTRAINT "exam_mark_sheets_exam_paper_id_academic_session_id_fkey" FOREIGN KEY ("exam_paper_id", "academic_session_id") REFERENCES "exam_papers"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_mark_sheets" ADD CONSTRAINT "exam_mark_sheets_section_id_academic_session_id_fkey" FOREIGN KEY ("section_id", "academic_session_id") REFERENCES "sections"("id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_mark_sheets" ADD CONSTRAINT "exam_mark_sheets_entered_by_staff_id_fkey" FOREIGN KEY ("entered_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_mark_sheet_id_exam_paper_id_fkey" FOREIGN KEY ("mark_sheet_id", "exam_paper_id") REFERENCES "exam_mark_sheets"("id", "exam_paper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules the application must never be able to break.
-- ---------------------------------------------------------------------------

-- A paper has to be worth something, and its pass rule has to be a percentage.
ALTER TABLE "exam_papers"
  ADD CONSTRAINT "exam_papers_max_marks_positive" CHECK ("max_marks" > 0),
  ADD CONSTRAINT "exam_papers_passing_percentage_valid"
    CHECK ("passing_percentage" >= 0 AND "passing_percentage" <= 100),
  -- Date-sheet times are a clock face: HH:MM, nothing else.
  ADD CONSTRAINT "exam_papers_start_time_format"
    CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "exam_papers_end_time_format"
    CHECK ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- The heart of the marks model.
--
-- PENDING means nobody has entered a mark, and must never be readable as a
-- zero. ABSENT is Kabirian's confirmed rule -- it scores 0 -- but the absence is
-- recorded as its own fact, so "was not there" and "scored nothing" stay
-- distinguishable forever. Without this constraint a service bug could quietly
-- turn one into the other.
--
-- The repeated IS NOT NULL is deliberate: a CHECK only rejects a row when it
-- evaluates to FALSE, and `NULL = 0` is NULL, so without it an ABSENT row with
-- no mark would slip through.
ALTER TABLE "marks"
  ADD CONSTRAINT "marks_status_matches_value" CHECK (
    ("status" = 'PENDING' AND "obtained_marks" IS NULL)
    OR ("status" = 'ENTERED' AND "obtained_marks" IS NOT NULL)
    OR ("status" = 'ABSENT'  AND "obtained_marks" IS NOT NULL AND "obtained_marks" = 0)
  ),
  ADD CONSTRAINT "marks_not_negative" CHECK ("obtained_marks" IS NULL OR "obtained_marks" >= 0);

-- Grade bands describe a real range, and percentages are percentages.
ALTER TABLE "grade_bands"
  ADD CONSTRAINT "grade_bands_range_valid" CHECK (
    "min_percentage" >= 0 AND "max_percentage" <= 100 AND "min_percentage" <= "max_percentage"
  );

-- Totals cannot be negative, and a result cannot claim more than was on offer.
ALTER TABLE "results"
  ADD CONSTRAINT "results_totals_sane" CHECK (
    "total_max_marks" >= 0
    AND "total_obtained_marks" >= 0
    AND "total_obtained_marks" <= "total_max_marks"
  ),
  ADD CONSTRAINT "results_percentage_valid" CHECK ("percentage" >= 0 AND "percentage" <= 100),
  ADD CONSTRAINT "results_version_positive" CHECK ("version" >= 1),
  -- An INCOMPLETE result is never given a position (ADR-104).
  ADD CONSTRAINT "results_incomplete_has_no_position"
    CHECK ("outcome" <> 'INCOMPLETE' OR "position" IS NULL);

-- At most one default grading scale. Partial unique indexes cannot be expressed
-- in Prisma; this is the same pattern as the section in-charge rule.
CREATE UNIQUE INDEX "grade_scales_one_default_key"
  ON "grade_scales" ("is_default") WHERE "is_default";

-- Exactly one CURRENT version of a result per student per exam.
--
-- Correcting a published result writes version 2 and clears the flag on version
-- 1, which stays readable forever. Uniqueness applies to what is true now, not
-- to what was ever true -- the same rule as enrolments (ADR-056).
CREATE UNIQUE INDEX "results_exam_id_student_id_current_key"
  ON "results" ("exam_id", "student_id") WHERE "is_current";
