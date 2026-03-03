-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "slack_channel" TEXT,
    "slack_thread_ts" TEXT,
    "slack_user_id" TEXT,
    "user_message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_requests" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_key" TEXT,
    "temperature" DOUBLE PRECISION,
    "max_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_calls" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tool_input" JSONB,
    "tool_output" JSONB,
    "duration_ms" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_outcomes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "answer" TEXT,
    "error" TEXT,
    "tools_used" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sessions_slack_channel_idx" ON "agent_sessions"("slack_channel");

-- CreateIndex
CREATE INDEX "agent_sessions_slack_user_id_idx" ON "agent_sessions"("slack_user_id");

-- CreateIndex
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions"("created_at");

-- CreateIndex
CREATE INDEX "agent_requests_session_id_idx" ON "agent_requests"("session_id");

-- CreateIndex
CREATE INDEX "agent_tool_calls_request_id_idx" ON "agent_tool_calls"("request_id");

-- CreateIndex
CREATE INDEX "agent_tool_calls_tool_name_idx" ON "agent_tool_calls"("tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "agent_outcomes_session_id_key" ON "agent_outcomes"("session_id");

-- AddForeignKey
ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "agent_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_outcomes" ADD CONSTRAINT "agent_outcomes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
