-- CreateTable
CREATE TABLE "ticket_analytics" (
    "id" TEXT NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "category" TEXT,
    "ai_confidence_score" DOUBLE PRECISION,
    "ai_classification" TEXT,
    "human_classification" TEXT,
    "ai_matches_human" BOOLEAN,
    "ai_message_count" INTEGER,
    "human_message_count" INTEGER,
    "resolution_time_min" DOUBLE PRECISION,
    "cost_savings_usd" DOUBLE PRECISION,
    "touch_count" INTEGER,
    "was_reopened" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_analytics_ticket_id_key" ON "ticket_analytics"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_analytics_category_idx" ON "ticket_analytics"("category");

-- CreateIndex
CREATE INDEX "ticket_analytics_ai_confidence_score_idx" ON "ticket_analytics"("ai_confidence_score");

-- CreateIndex
CREATE INDEX "ticket_analytics_ai_matches_human_idx" ON "ticket_analytics"("ai_matches_human");
