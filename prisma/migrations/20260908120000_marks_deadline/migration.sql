-- Phase 21: the marks deadline, and reopening one paper after it.
--
-- Two additive changes, no data touched:
--
--   * `exams.marks_deadline` — the last college day on which a teacher may
--     enter or correct marks for that exam. Null means "no deadline", which is
--     what every existing exam gets, so nothing that works today stops working.
--
--   * three columns on `exam_mark_sheets` recording that the office reopened
--     one paper after the deadline: until when, why, and who did it. Null on
--     every existing row: nothing has been reopened.
--
-- Who may enter, correct and submit is still decided in the service from
-- `teacher_assignments`; these columns only say *until when*.

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "marks_deadline" DATE;

-- AlterTable
ALTER TABLE "exam_mark_sheets" ADD COLUMN     "reopened_until" DATE,
ADD COLUMN     "reopened_reason" VARCHAR(255),
ADD COLUMN     "reopened_by_user_id" UUID,
ADD COLUMN     "reopened_at" TIMESTAMPTZ(3);

-- AddForeignKey
ALTER TABLE "exam_mark_sheets" ADD CONSTRAINT "exam_mark_sheets_reopened_by_user_id_fkey" FOREIGN KEY ("reopened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- A reopening must say until when and why, or be absent altogether: a row
-- with a date and no reason (or the reverse) would be a half-recorded
-- decision. Every existing row has all four columns null and satisfies it.
-- ---------------------------------------------------------------------------
ALTER TABLE "exam_mark_sheets"
  ADD CONSTRAINT "exam_mark_sheets_reopening_is_complete"
  CHECK (
    ("reopened_until" IS NULL AND "reopened_reason" IS NULL AND "reopened_at" IS NULL)
    OR ("reopened_until" IS NOT NULL AND "reopened_reason" IS NOT NULL AND "reopened_at" IS NOT NULL)
  );
