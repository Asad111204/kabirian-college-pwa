-- CreateEnum
CREATE TYPE "document_owner" AS ENUM ('STUDENT', 'STAFF', 'NOTICE', 'EVENT', 'COLLEGE');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('UPLOADING', 'ACTIVE', 'NEEDS_REPLACEMENT', 'REPLACED', 'DELETED', 'FAILED');

-- CreateTable
CREATE TABLE "document_types" (
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "owner_type" "document_owner" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT true,
    "allowed_mime_types" TEXT[],
    "max_size_bytes" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "document_type_key" VARCHAR(50) NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "storage_provider" VARCHAR(30) NOT NULL DEFAULT 'google_drive',
    "storage_file_id" VARCHAR(256) NOT NULL,
    "storage_folder_id" VARCHAR(256),
    "file_name" VARCHAR(255) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'UPLOADING',
    "replacement_reason" VARCHAR(255),
    "replaced_by_document_id" UUID,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_types_owner_type_sort_order_idx" ON "document_types"("owner_type", "sort_order");

-- CreateIndex
CREATE INDEX "documents_student_id_document_type_key_status_idx" ON "documents"("student_id", "document_type_key", "status");

-- CreateIndex
CREATE INDEX "documents_staff_id_document_type_key_status_idx" ON "documents"("staff_id", "document_type_key", "status");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_provider_storage_file_id_key" ON "documents"("storage_provider", "storage_file_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_key_fkey" FOREIGN KEY ("document_type_key") REFERENCES "document_types"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_replaced_by_document_id_fkey" FOREIGN KEY ("replaced_by_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules the application must never be able to break, enforced by the database.
-- ---------------------------------------------------------------------------

-- A document belongs to exactly one person. Without this, a row could name both
-- a student and a staff member, and every "whose document is this?" check in the
-- service layer would have two answers.
--
-- Phase 9 adds notice and event attachments; this constraint is widened then.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_exactly_one_owner"
  CHECK (num_nonnulls("student_id", "staff_id") = 1);

-- At most one CURRENT document of each type per person.
--
-- Uploading a second photo does not create a second row that is also "the
-- photo": it replaces the first, which becomes REPLACED and stops matching this
-- index. Same reasoning as the enrollment and roll-number rules (ADR-056/057) —
-- uniqueness applies to what is true now, not to what was ever true, so the full
-- history is kept.
CREATE UNIQUE INDEX "documents_student_id_document_type_key_current_key"
  ON "documents" ("student_id", "document_type_key")
  WHERE "student_id" IS NOT NULL AND "status" IN ('ACTIVE', 'NEEDS_REPLACEMENT');

CREATE UNIQUE INDEX "documents_staff_id_document_type_key_current_key"
  ON "documents" ("staff_id", "document_type_key")
  WHERE "staff_id" IS NOT NULL AND "status" IN ('ACTIVE', 'NEEDS_REPLACEMENT');
