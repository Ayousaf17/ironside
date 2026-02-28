-- CreateTable
CREATE TABLE "agent_behavior_logs" (
    "id" TEXT NOT NULL,
    "gorgias_event_id" TEXT,
    "agent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "ticket_subject" TEXT,
    "category" TEXT,
    "response_text" TEXT,
    "macro_id_used" INTEGER,
    "time_to_respond_min" DOUBLE PRECISION,
    "touches_to_resolution" INTEGER,
    "reopened" BOOLEAN NOT NULL DEFAULT false,
    "csat_score" INTEGER,
    "tags_applied" TEXT[],
    "raw_event" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_behavior_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_behavior_logs_gorgias_event_id_key" ON "agent_behavior_logs"("gorgias_event_id");

-- CreateIndex
CREATE INDEX "agent_behavior_logs_agent_idx" ON "agent_behavior_logs"("agent");

-- CreateIndex
CREATE INDEX "agent_behavior_logs_ticket_id_idx" ON "agent_behavior_logs"("ticket_id");

-- CreateIndex
CREATE INDEX "agent_behavior_logs_action_idx" ON "agent_behavior_logs"("action");

-- CreateIndex
CREATE INDEX "agent_behavior_logs_occurred_at_idx" ON "agent_behavior_logs"("occurred_at");
