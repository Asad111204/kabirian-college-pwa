-- An INCOMPLETE result has no percentage.
--
-- The column was created NOT NULL, so a student whose papers were not all
-- marked had to be stored with *some* figure. The figure kept was their marks
-- out of the whole exam — real data, but not a result: it reads as a score, and
-- it is not one. The college's rule is that an INCOMPLETE result has no
-- percentage, no grade and no position (ADR-129).
--
-- Nothing else changes. The column stays DECIMAL(5,2), every other column is
-- untouched, and no row is read, written or deleted.

-- AlterTable
ALTER TABLE "results" ALTER COLUMN "percentage" DROP NOT NULL;

-- Nullable does not mean optional. A percentage is absent for exactly one
-- reason, and present for every other outcome. Both halves are stated, so
-- neither a missing figure on a PASS nor a stray figure on an INCOMPLETE can be
-- stored -- the same shape as the marks status rule (ADR-102).
--
-- `outcome` is NOT NULL and `IS NULL` never yields NULL, so this constraint is
-- always TRUE or FALSE: there is no three-valued-logic gap for a row to slip
-- through, which is the trap the ABSENT branch of `marks_status_matches_value`
-- fell into before it was fixed.
ALTER TABLE "results"
  ADD CONSTRAINT "results_percentage_matches_outcome" CHECK (
    ("outcome" = 'INCOMPLETE' AND "percentage" IS NULL)
    OR ("outcome" <> 'INCOMPLETE' AND "percentage" IS NOT NULL)
  );

-- `results_percentage_valid` (0 <= percentage <= 100) is deliberately left as
-- it is. A CHECK only rejects a row it evaluates to FALSE, and a NULL
-- percentage makes it evaluate to NULL, so it keeps bounding the values that
-- exist without objecting to the ones that do not.
