-- Phase 28: the college charges by the year, not by the month.
--
-- The fee module was built monthly on the answer given in September; the
-- college has since said plainly that it charges an ANNUAL fee made up of
-- named heads, and that families pay it in instalments whenever they can. So:
--
--   * fee packages go entirely — every student's amounts are typed in at
--     admission, head by head, and every head is optional,
--   * a voucher becomes one student's bill for one academic session rather
--     than for one month, with a due date only if the college sets one,
--   * what a voucher charged is kept line by line, frozen at issue.
--
-- This DROPS `fee_packages` and the monthly columns on `fee_vouchers`, and it
-- DELETES every existing voucher and payment: a monthly voucher cannot be
-- turned into an annual one, and a package has nowhere to go in the new model.
--
-- What that removes on the live database was checked, row by row, before this
-- migration was written on 2026-09-11:
--
--   packages : "paisa hi paisaaaaa" (Rs 150), "Annual package" (Rs 50,000)
--   vouchers : FV-000001, for a student recorded as "testing as student"
--   payments : one of Rs 150, in cash
--
-- All of it is the office trying the module out. It was shown to the college
-- and the deletion agreed before this ran. If this migration is ever replayed
-- on a database holding real fee history, STOP: that history would go with it.

-- CreateEnum
CREATE TYPE "fee_head" AS ENUM ('TUITION', 'ANNUAL_FUNDS', 'EVENTS_FUNDS', 'BOARD_REGISTRATION', 'BOARD_ADMISSION', 'TOUR', 'OTHER');

-- The monthly world, removed. Payments go first because a voucher cannot be
-- deleted while one points at it.
DELETE FROM "fee_payments";
DELETE FROM "fee_vouchers";

ALTER TABLE "fee_vouchers" DROP CONSTRAINT IF EXISTS "fee_vouchers_fee_package_id_fkey";
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_fee_package_id_fkey";
DROP INDEX IF EXISTS "fee_vouchers_student_id_month_live_key";
DROP INDEX IF EXISTS "fee_vouchers_student_id_month_idx";
DROP INDEX IF EXISTS "fee_vouchers_month_status_idx";

ALTER TABLE "fee_vouchers" DROP COLUMN "month";
ALTER TABLE "fee_vouchers" DROP COLUMN "package_name";
ALTER TABLE "fee_vouchers" DROP COLUMN "fee_package_id";
ALTER TABLE "students" DROP COLUMN "fee_package_id";
DROP TABLE "fee_packages";

-- A year, not a month. The session is now required: a fee belongs to a year.
ALTER TABLE "fee_vouchers" ALTER COLUMN "academic_session_id" SET NOT NULL;
-- Families pay as they can, so a due date is something the college may set
-- rather than something every voucher must have.
ALTER TABLE "fee_vouchers" ALTER COLUMN "due_date" DROP NOT NULL;

-- One live voucher per student per year: issuing a session's fees twice must
-- not bill a family twice. A cancelled one is excluded, so a voucher issued
-- in error can be withdrawn and reissued.
CREATE UNIQUE INDEX "fee_vouchers_student_id_academic_session_id_live_key"
  ON "fee_vouchers"("student_id", "academic_session_id") WHERE "status" <> 'CANCELLED';

-- CreateIndex
CREATE INDEX "fee_vouchers_student_id_created_at_idx" ON "fee_vouchers"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fee_vouchers_academic_session_id_status_idx" ON "fee_vouchers"("academic_session_id", "status");

-- AddForeignKey
ALTER TABLE "fee_vouchers" DROP CONSTRAINT IF EXISTS "fee_vouchers_academic_session_id_fkey";
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: what one student is charged for one year, head by head.
CREATE TABLE "student_fee_lines" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "head" "fee_head" NOT NULL,
    "label" VARCHAR(80),
    "amount_paisa" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_fee_lines_pkey" PRIMARY KEY ("id"),
    -- A line of nothing is not a charge; leave the head out instead.
    CONSTRAINT "student_fee_lines_amount_is_positive" CHECK ("amount_paisa" > 0 AND "amount_paisa" <= 1000000000)
);

-- CreateTable: what a voucher actually charged, frozen at issue.
CREATE TABLE "fee_voucher_lines" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "head" "fee_head" NOT NULL,
    "label" VARCHAR(80),
    "amount_paisa" INTEGER NOT NULL,

    CONSTRAINT "fee_voucher_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_voucher_lines_amount_is_positive" CHECK ("amount_paisa" > 0 AND "amount_paisa" <= 1000000000)
);

-- CreateIndex
CREATE INDEX "student_fee_lines_student_id_academic_session_id_idx" ON "student_fee_lines"("student_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "fee_voucher_lines_voucher_id_idx" ON "fee_voucher_lines"("voucher_id");

-- A student's fee lines belong to the student: erasing a record that nothing
-- else refers to takes its own fee lines with it (Phase 26).
ALTER TABLE "student_fee_lines" ADD CONSTRAINT "student_fee_lines_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_lines" ADD CONSTRAINT "student_fee_lines_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The lines are part of the voucher, not records of their own.
ALTER TABLE "fee_voucher_lines" ADD CONSTRAINT "fee_voucher_lines_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What the college pays a member of staff each month. Optional: not every
-- staff record carries a salary.
ALTER TABLE "staff" ADD COLUMN "salary_paisa" INTEGER;
ALTER TABLE "staff" ADD CONSTRAINT "staff_salary_is_sane"
  CHECK ("salary_paisa" IS NULL OR ("salary_paisa" >= 0 AND "salary_paisa" <= 1000000000));
