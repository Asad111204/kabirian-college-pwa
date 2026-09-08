-- Phase 22: staff attendance.
--
-- The office marks the staff for a day: Present, Absent, Short Leave or Leave.
-- One row per staff member per college date — there is no period, no subject
-- and no draft-then-submit, because this is the office's own register rather
-- than something handed in by somebody else. A correction is an edit, audited.
--
-- Nothing existing is touched: one enum and one table, both new.

-- CreateEnum
CREATE TYPE "staff_attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'SHORT_LEAVE', 'LEAVE');

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "staff_attendance_status" NOT NULL,
    "remarks" VARCHAR(255),
    "marked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- One mark per person per day, enforced by the database rather than by care:
-- two clerks marking the same morning cannot leave two answers behind.
CREATE UNIQUE INDEX "staff_attendance_staff_id_date_key" ON "staff_attendance"("staff_id", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance"("date" DESC);

-- CreateIndex
CREATE INDEX "staff_attendance_staff_id_date_idx" ON "staff_attendance"("staff_id", "date" DESC);

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
