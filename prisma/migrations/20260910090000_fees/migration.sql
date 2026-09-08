-- Phase 25: fees.
--
-- Named packages with a monthly amount, one assigned to each student, a
-- per-student concession on top, one voucher per student per month with a due
-- date, and money recorded against it.
--
-- Every amount is a whole number of PAISA. Integers add and subtract exactly;
-- a ledger kept in floating-point rupees rounds differently on two screens and
-- is a ledger nobody trusts. The CHECKs below say so in the database, where no
-- future code path can forget.
--
-- Nothing existing is rewritten: two enums, three tables, two defaulted
-- columns on `students`, and one counter row.

-- CreateEnum
CREATE TYPE "fee_voucher_status" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "fee_payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'OTHER');

-- CreateTable
CREATE TABLE "fee_packages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "monthly_amount_paisa" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_packages_amount_is_sane" CHECK ("monthly_amount_paisa" >= 0 AND "monthly_amount_paisa" <= 1000000000)
);

-- CreateTable
CREATE TABLE "fee_vouchers" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_session_id" UUID,
    "fee_package_id" UUID,
    "package_name" VARCHAR(120) NOT NULL,
    "voucher_number" VARCHAR(24) NOT NULL,
    "month" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_paisa" INTEGER NOT NULL,
    "discount_paisa" INTEGER NOT NULL DEFAULT 0,
    "late_fine_paisa" INTEGER NOT NULL DEFAULT 0,
    "paid_paisa" INTEGER NOT NULL DEFAULT 0,
    "status" "fee_voucher_status" NOT NULL DEFAULT 'UNPAID',
    "issued_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" UUID,
    "cancel_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_vouchers_pkey" PRIMARY KEY ("id"),
    -- No negative money anywhere, and a concession never larger than the fee
    -- it is taken off: a voucher that owes the family money is a bug, not a
    -- feature the college asked for.
    CONSTRAINT "fee_vouchers_amounts_are_sane" CHECK (
      "gross_paisa" >= 0 AND "discount_paisa" >= 0 AND "late_fine_paisa" >= 0 AND "paid_paisa" >= 0
      AND "discount_paisa" <= "gross_paisa"
    ),
    -- A half-recorded cancellation cannot exist: either it was cancelled, by
    -- somebody, for a reason, or it was not cancelled at all.
    CONSTRAINT "fee_vouchers_cancellation_is_complete" CHECK (
      ("cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancel_reason" IS NULL)
      OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "fee_payment_method" NOT NULL,
    "reference" VARCHAR(60),
    "remarks" VARCHAR(255),
    "received_by_user_id" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_user_id" UUID,
    "void_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id"),
    -- A payment of nothing is not a payment.
    CONSTRAINT "fee_payments_amount_is_positive" CHECK ("amount_paisa" > 0 AND "amount_paisa" <= 1000000000),
    CONSTRAINT "fee_payments_void_is_complete" CHECK (
      ("voided_at" IS NULL AND "voided_by_user_id" IS NULL AND "void_reason" IS NULL)
      OR ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL)
    )
);

-- The student's package and their own concession.
ALTER TABLE "students" ADD COLUMN "fee_package_id" UUID;
ALTER TABLE "students" ADD COLUMN "fee_discount_paisa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "students" ADD CONSTRAINT "students_fee_discount_is_sane"
  CHECK ("fee_discount_paisa" >= 0 AND "fee_discount_paisa" <= 1000000000);

-- CreateIndex
CREATE UNIQUE INDEX "fee_packages_name_key" ON "fee_packages"("name");

-- CreateIndex
CREATE INDEX "fee_packages_is_active_name_idx" ON "fee_packages"("is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_vouchers_voucher_number_key" ON "fee_vouchers"("voucher_number");

-- One live voucher per student per month, enforced by the database rather than
-- by care: running the month's billing twice must not bill a family twice. A
-- cancelled voucher is excluded, so a mistake can be withdrawn and reissued.
CREATE UNIQUE INDEX "fee_vouchers_student_id_month_live_key"
  ON "fee_vouchers"("student_id", "month") WHERE "status" <> 'CANCELLED';

-- CreateIndex
CREATE INDEX "fee_vouchers_student_id_month_idx" ON "fee_vouchers"("student_id", "month" DESC);

-- CreateIndex
CREATE INDEX "fee_vouchers_month_status_idx" ON "fee_vouchers"("month", "status");

-- CreateIndex
CREATE INDEX "fee_vouchers_status_due_date_idx" ON "fee_vouchers"("status", "due_date");

-- CreateIndex
CREATE INDEX "fee_payments_voucher_id_paid_on_idx" ON "fee_payments"("voucher_id", "paid_on");

-- CreateIndex
CREATE INDEX "fee_payments_paid_on_idx" ON "fee_payments"("paid_on");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_fee_package_id_fkey" FOREIGN KEY ("fee_package_id") REFERENCES "fee_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A student with a voucher is never deleted (Phase 26 refuses it), so a bill
-- cannot be orphaned from the family it was sent to.
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deleting a package must never take last March's bills with it; the voucher
-- keeps the name it was issued under.
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_fee_package_id_fkey" FOREIGN KEY ("fee_package_id") REFERENCES "fee_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money records are never removed by a cascade from something above them.
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The counter that hands out voucher numbers. Created here rather than only in
-- the reference seed, so a database that has had this migration can always
-- issue a voucher.
INSERT INTO "code_sequences" ("key", "prefix", "next_value", "padding")
VALUES ('FEE_VOUCHER', 'FV-', 1, 6)
ON CONFLICT ("key") DO NOTHING;
