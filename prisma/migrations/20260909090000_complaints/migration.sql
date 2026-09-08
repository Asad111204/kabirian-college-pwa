-- Phase 23: complaints.
--
-- A student writes an application to the office; the office reads it and
-- answers. The application itself is one row, never rewritten once sent —
-- it is what the student said, on the record — and the exchange that follows
-- is a row per message in `complaint_replies`.
--
-- Nothing existing is touched: two enums and two tables, all new.

-- CreateEnum
CREATE TYPE "complaint_category" AS ENUM ('ACADEMIC', 'ATTENDANCE', 'EXAMS_RESULTS', 'FEES', 'FACILITIES', 'DISCIPLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "complaint_status" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'RESOLVED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_session_id" UUID,
    "category" "complaint_category" NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "complaint_status" NOT NULL DEFAULT 'SUBMITTED',
    "awaiting_office" BOOLEAN NOT NULL DEFAULT true,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_replies" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "by_office" BOOLEAN NOT NULL,
    "author_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_replies_pkey" PRIMARY KEY ("id")
);

-- The office's list is ordered by the last thing that happened, so the
-- application nobody has touched for longest rises to the top.
CREATE INDEX "complaints_status_last_activity_at_idx" ON "complaints"("status", "last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "complaints_student_id_created_at_idx" ON "complaints"("student_id", "created_at" DESC);

-- The office's morning: everything still on its desk, longest wait first.
CREATE INDEX "complaints_awaiting_office_last_activity_at_idx" ON "complaints"("awaiting_office", "last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "complaints_category_idx" ON "complaints"("category");

-- CreateIndex
CREATE INDEX "complaint_replies_complaint_id_created_at_idx" ON "complaint_replies"("complaint_id", "created_at");

-- A student with history is never deleted (Phase 26 refuses it), so the
-- application cannot be orphaned.
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The replies are part of the application, not records of their own: if the
-- application ever goes, they go with it.
ALTER TABLE "complaint_replies" ADD CONSTRAINT "complaint_replies_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_replies" ADD CONSTRAINT "complaint_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
