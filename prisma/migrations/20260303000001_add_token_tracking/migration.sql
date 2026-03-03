-- CreateTable
CREATE TABLE "ai_token_usage" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "request_id" TEXT,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_token_usage_session_id_idx" ON "ai_token_usage"("session_id");

-- CreateIndex
CREATE INDEX "ai_token_usage_created_at_idx" ON "ai_token_usage"("created_at");

-- CreateIndex
CREATE INDEX "ai_token_usage_source_idx" ON "ai_token_usage"("source");
