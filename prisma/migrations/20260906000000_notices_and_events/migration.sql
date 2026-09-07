-- Phase 11: notices and events.
--
-- Four enums, three tables, their indexes and foreign keys, and two nullable
-- columns on `documents` so a file can belong to a notice or an event. No
-- table is dropped and no row of any table is touched.
--
-- One existing rule changes: `documents_exactly_one_owner` becomes
-- `documents_at_most_one_owner` (see the note at the end). That is the only
-- statement here that alters something already in the database, and it
-- removes a constraint the existing rows already satisfy under the new one.
--
-- The hand-written constraints at the end are the ones Prisma cannot express:
-- a NULLS NOT DISTINCT unique index, and CHECKs that keep a target's columns in
-- step with its audience and keep publish/expiry and start/end in order.

-- CreateEnum
CREATE TYPE "notice_category" AS ENUM ('GENERAL', 'ACADEMIC', 'EXAM', 'EVENT', 'EMERGENCY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "audience" AS ENUM ('ALL', 'STUDENTS', 'STAFF', 'CLASS', 'DIVISION', 'PROGRAM', 'GROUP', 'SECTION');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "event_id" UUID,
ADD COLUMN     "notice_id" UUID;

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "category" "notice_category" NOT NULL DEFAULT 'GENERAL',
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "publish_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_targets" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "audience" "audience" NOT NULL,
    "class_id" UUID,
    "division_id" UUID,
    "program_id" UUID,
    "academic_group_id" UUID,
    "section_id" UUID,

    CONSTRAINT "notice_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "location" VARCHAR(200),
    "audience" "audience" NOT NULL DEFAULT 'ALL',
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "cover_document_id" UUID,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_status_publish_at_idx" ON "notices"("status", "publish_at" DESC);

-- CreateIndex
CREATE INDEX "notices_expires_at_idx" ON "notices"("expires_at");

-- CreateIndex
CREATE INDEX "notice_targets_notice_id_idx" ON "notice_targets"("notice_id");

-- CreateIndex
CREATE INDEX "notice_targets_section_id_idx" ON "notice_targets"("section_id");

-- CreateIndex
CREATE INDEX "notice_targets_academic_group_id_idx" ON "notice_targets"("academic_group_id");

-- CreateIndex
CREATE INDEX "notice_targets_class_id_idx" ON "notice_targets"("class_id");

-- CreateIndex
CREATE INDEX "notice_targets_division_id_idx" ON "notice_targets"("division_id");

-- CreateIndex
CREATE INDEX "notice_targets_program_id_idx" ON "notice_targets"("program_id");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "documents_notice_id_idx" ON "documents"("notice_id");

-- CreateIndex
CREATE INDEX "documents_event_id_idx" ON "documents"("event_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_academic_group_id_fkey" FOREIGN KEY ("academic_group_id") REFERENCES "academic_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_targets" ADD CONSTRAINT "notice_targets_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_cover_document_id_fkey" FOREIGN KEY ("cover_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Rules the application must never be able to break, enforced by the database.
-- None of these can be expressed in the Prisma schema, so they are written
-- here by hand, under names Prisma does not expect to own.
-- ---------------------------------------------------------------------------

-- One notice cannot carry the same target twice.
--
-- NULLS NOT DISTINCT is the whole point: five of the seven columns are NULL on
-- every row, and PostgreSQL's default treats each NULL as different from every
-- other NULL -- so without this clause "ALL" could be added to one notice a
-- hundred times. Same reasoning as attendance_sheets (Phase 7).
CREATE UNIQUE INDEX "notice_targets_one_per_notice_key"
  ON "notice_targets" ("notice_id", "audience", "class_id", "division_id", "program_id", "academic_group_id", "section_id")
  NULLS NOT DISTINCT;

-- A target names exactly what its audience needs, and nothing else.
--
-- ALL, STUDENTS and STAFF carry no id. Each structural audience carries its own
-- id and no other: a CLASS target with a section on it is not a more specific
-- class target, it is a mistake. The same rule lives in
-- src/server/notices/notice-policy.ts (checkTarget) so the office gets a
-- sentence; this is the backstop.
ALTER TABLE "notice_targets"
  ADD CONSTRAINT "notice_targets_audience_matches_columns" CHECK (
    ("audience" IN ('ALL', 'STUDENTS', 'STAFF')
      AND num_nonnulls("class_id", "division_id", "program_id", "academic_group_id", "section_id") = 0)
    OR ("audience" = 'CLASS'    AND "class_id"          IS NOT NULL AND num_nonnulls("division_id", "program_id", "academic_group_id", "section_id") = 0)
    OR ("audience" = 'DIVISION' AND "division_id"       IS NOT NULL AND num_nonnulls("class_id", "program_id", "academic_group_id", "section_id") = 0)
    OR ("audience" = 'PROGRAM'  AND "program_id"        IS NOT NULL AND num_nonnulls("class_id", "division_id", "academic_group_id", "section_id") = 0)
    OR ("audience" = 'GROUP'    AND "academic_group_id" IS NOT NULL AND num_nonnulls("class_id", "division_id", "program_id", "section_id") = 0)
    OR ("audience" = 'SECTION'  AND "section_id"        IS NOT NULL AND num_nonnulls("class_id", "division_id", "program_id", "academic_group_id") = 0)
  );

-- A notice cannot expire before it is published.
ALTER TABLE "notices"
  ADD CONSTRAINT "notices_expiry_after_publish"
  CHECK ("expires_at" IS NULL OR "expires_at" > "publish_at");

-- An event is for a whole population. The structural audiences are for notices.
ALTER TABLE "events"
  ADD CONSTRAINT "events_audience_is_population"
  CHECK ("audience" IN ('ALL', 'STUDENTS', 'STAFF'));

-- An event cannot end before it starts.
ALTER TABLE "events"
  ADD CONSTRAINT "events_end_after_start"
  CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at");

-- ---------------------------------------------------------------------------
-- The one change to an existing rule.
--
-- Phase 6 required a document to belong to exactly one person. Notices and
-- events are owners too now, and a COLLEGE document (allowed for by the
-- document_owner enum since Phase 6) belongs to nobody in particular. So: at
-- most one owner. Which owner column a document type may use is kept in step
-- by the service against document_types.owner_type.
--
-- DROP CONSTRAINT here removes a rule, not data: the two documents that exist
-- each name exactly one owner and satisfy the new rule (verified before this
-- migration was written). No row is touched.
-- ---------------------------------------------------------------------------
ALTER TABLE "documents" DROP CONSTRAINT "documents_exactly_one_owner";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_at_most_one_owner"
  CHECK (num_nonnulls("student_id", "staff_id", "notice_id", "event_id") <= 1);
