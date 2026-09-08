-- Phase 20: homework.
--
-- One new table, `homework`: a piece of work a teacher sets for one section
-- in one subject, with a title, instructions and an optional due date. Its
-- files are documents, so `documents` gains a fifth owner column,
-- `homework_id`, and the document owner enum gains HOMEWORK. No existing row
-- is touched; the one changed rule (`documents_at_most_one_owner`) is widened
-- to include the new column and still holds for every row that exists.
--
-- Who may set homework is decided in the service from `teacher_assignments`,
-- exactly as attendance and marks are; nothing here encodes a rule about
-- people beyond the foreign keys.

-- AlterEnum
ALTER TYPE "document_owner" ADD VALUE 'HOMEWORK';

-- CreateTable
CREATE TABLE "homework" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instructions" TEXT NOT NULL,
    "due_date" DATE,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "homework_id" UUID;

-- CreateIndex
CREATE INDEX "homework_section_id_due_date_idx" ON "homework"("section_id", "due_date" DESC);

-- CreateIndex
CREATE INDEX "homework_staff_id_created_at_idx" ON "homework"("staff_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "homework_academic_session_id_idx" ON "homework"("academic_session_id");

-- CreateIndex
CREATE INDEX "documents_homework_id_idx" ON "documents"("homework_id");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The owner rule, widened. A document belongs to at most one of: a student, a
-- staff member, a notice, an event, or now a piece of homework. Every existing
-- row names at most one owner already, so dropping and re-adding the CHECK
-- changes no data and refuses nothing that exists (verified before this
-- migration was written).
-- ---------------------------------------------------------------------------
ALTER TABLE "documents" DROP CONSTRAINT "documents_at_most_one_owner";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_at_most_one_owner"
  CHECK (num_nonnulls("student_id", "staff_id", "notice_id", "event_id", "homework_id") <= 1);
