-- Enable Row Level Security on all tables
-- Prisma connects as the postgres superuser which bypasses RLS automatically.
-- This blocks direct access via the anon/authenticated roles (Supabase dashboard, PostgREST).

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_behavior_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE gorgias_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_analytics ENABLE ROW LEVEL SECURITY;
