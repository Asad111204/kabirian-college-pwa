-- Phase 27: notifications.
--
-- One row per person per thing they have not looked at yet. Written by
-- fan-out at the moment something happens, so "what have I not seen?" is one
-- indexed query for that person, read state belongs to them rather than being
-- shared, and somebody admitted next week is not shown last week's news as if
-- it were new.
--
-- Rows belong to the account and go with it: a notification is not history of
-- anything, it is a nudge that has been read or has not.
--
-- Nothing existing is touched: one enum and one table, both new.

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('NOTICE', 'EVENT', 'HOMEWORK', 'EXAM', 'RESULT', 'COMPLAINT', 'FEE');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(400),
    "link" VARCHAR(300) NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    -- A link is always a path inside this app. Nothing that arrives in a
    -- notification can send somebody to another site.
    CONSTRAINT "notifications_link_is_internal" CHECK ("link" LIKE '/%' AND "link" NOT LIKE '//%')
);

-- The two questions asked on every page load: what is unread, and what is
-- unread in this part of the college.
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_kind_read_at_idx" ON "notifications"("user_id", "kind", "read_at");

-- A notification is a nudge, not history: it goes when the account goes.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
