-- Phase 26: finance.
--
-- The other half of the college's money: what it spends. Kept like a fee
-- payment and for the same reason -- never edited, never deleted, voided with
-- a name and a reason when it was recorded in error -- so the two sides of the
-- ledger behave the same way and add up the same way.
--
-- Amounts are whole paisa, as everywhere else.
--
-- Nothing existing is touched: one enum and one table, both new.

-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('SALARIES', 'UTILITIES', 'RENT', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT', 'EVENTS', 'OTHER');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "category" "expense_category" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "spent_on" DATE NOT NULL,
    "method" "fee_payment_method" NOT NULL,
    "reference" VARCHAR(60),
    "remarks" VARCHAR(255),
    "recorded_by_user_id" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_user_id" UUID,
    "void_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
    -- Spending nothing is not spending.
    CONSTRAINT "expenses_amount_is_positive" CHECK ("amount_paisa" > 0 AND "amount_paisa" <= 1000000000),
    CONSTRAINT "expenses_void_is_complete" CHECK (
      ("voided_at" IS NULL AND "voided_by_user_id" IS NULL AND "void_reason" IS NULL)
      OR ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL)
    )
);

-- The finance page reads a month at a time, and the graph reads a year.
CREATE INDEX "expenses_spent_on_idx" ON "expenses"("spent_on" DESC);

-- CreateIndex
CREATE INDEX "expenses_category_spent_on_idx" ON "expenses"("category", "spent_on" DESC);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
