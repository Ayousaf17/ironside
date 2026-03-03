-- Enrich ApiLog
ALTER TABLE "api_logs" ADD COLUMN "actor_user" TEXT;
ALTER TABLE "api_logs" ADD COLUMN "slack_channel" TEXT;
ALTER TABLE "api_logs" ADD COLUMN "slack_thread_ts" TEXT;
ALTER TABLE "api_logs" ADD COLUMN "ticket_id" INTEGER;
ALTER TABLE "api_logs" ADD COLUMN "intent" TEXT;
ALTER TABLE "api_logs" ADD COLUMN "tools_used" TEXT[] DEFAULT '{}';
ALTER TABLE "api_logs" ADD COLUMN "session_id" TEXT;
ALTER TABLE "api_logs" ADD COLUMN "token_count" INTEGER;

-- Enrich PerformanceMetric
ALTER TABLE "performance_metrics" ADD COLUMN "source" TEXT;
ALTER TABLE "performance_metrics" ADD COLUMN "session_id" TEXT;
ALTER TABLE "performance_metrics" ADD COLUMN "endpoint" TEXT;

-- Enrich PulseCheck
ALTER TABLE "pulse_checks" ADD COLUMN "open_tickets" INTEGER;
ALTER TABLE "pulse_checks" ADD COLUMN "closed_tickets" INTEGER;
ALTER TABLE "pulse_checks" ADD COLUMN "spam_rate" DOUBLE PRECISION;
ALTER TABLE "pulse_checks" ADD COLUMN "avg_resolution_min" DOUBLE PRECISION;
ALTER TABLE "pulse_checks" ADD COLUMN "top_category" TEXT;
ALTER TABLE "pulse_checks" ADD COLUMN "action_items" JSONB;
ALTER TABLE "pulse_checks" ADD COLUMN "session_id" TEXT;

-- Enrich AgentBehaviorLog
ALTER TABLE "agent_behavior_logs" ADD COLUMN "agent_email" TEXT;
ALTER TABLE "agent_behavior_logs" ADD COLUMN "ticket_channel" TEXT;
ALTER TABLE "agent_behavior_logs" ADD COLUMN "ticket_tags" TEXT[] DEFAULT '{}';
ALTER TABLE "agent_behavior_logs" ADD COLUMN "response_char_count" INTEGER;
ALTER TABLE "agent_behavior_logs" ADD COLUMN "message_position" INTEGER;
ALTER TABLE "agent_behavior_logs" ADD COLUMN "is_first_response" BOOLEAN;

-- CreateTable: gorgias_users
CREATE TABLE "gorgias_users" (
    "id" TEXT NOT NULL,
    "gorgias_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" TEXT,
    "slack_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gorgias_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: dashboard_config
CREATE TABLE "dashboard_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conversation_contexts
CREATE TABLE "conversation_contexts" (
    "id" TEXT NOT NULL,
    "slack_thread_ts" TEXT NOT NULL,
    "slack_channel" TEXT,
    "slack_user_id" TEXT,
    "last_action" TEXT,
    "last_ticket_ids" INTEGER[] DEFAULT '{}',
    "pending_confirmation" JSONB,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gorgias_users_gorgias_id_key" ON "gorgias_users"("gorgias_id");

-- CreateIndex
CREATE UNIQUE INDEX "gorgias_users_email_key" ON "gorgias_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_config_key_key" ON "dashboard_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_contexts_slack_thread_ts_key" ON "conversation_contexts"("slack_thread_ts");

-- CreateIndex
CREATE INDEX "conversation_contexts_expires_at_idx" ON "conversation_contexts"("expires_at");
