-- Add structured analytics columns to pulse_checks for dashboard charting
ALTER TABLE "pulse_checks"
  ADD COLUMN IF NOT EXISTS "date_range_start" DATE,
  ADD COLUMN IF NOT EXISTS "date_range_end" DATE,
  ADD COLUMN IF NOT EXISTS "resolution_p50_min" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "resolution_p90_min" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tickets_analyzed" INTEGER,
  ADD COLUMN IF NOT EXISTS "unassigned_pct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "channel_email" INTEGER,
  ADD COLUMN IF NOT EXISTS "channel_chat" INTEGER,
  ADD COLUMN IF NOT EXISTS "workload" JSONB,
  ADD COLUMN IF NOT EXISTS "top_questions" JSONB,
  ADD COLUMN IF NOT EXISTS "tags" JSONB,
  ADD COLUMN IF NOT EXISTS "ops_notes" JSONB;
