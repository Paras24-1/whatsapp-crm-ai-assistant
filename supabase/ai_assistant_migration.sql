-- ============================================================
-- AI Assistant Migration - Audit Logs & History Persistence
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLE: assistant_tool_logs (Audit logging for all tool executions)
CREATE TABLE IF NOT EXISTS assistant_tool_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           TEXT,
  user_email        TEXT,
  user_role         TEXT,
  tool_name         TEXT NOT NULL,
  params            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  error_message     TEXT,
  execution_ms      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_logs_user_id ON assistant_tool_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_tool_logs_tool ON assistant_tool_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_assistant_tool_logs_created_at ON assistant_tool_logs(created_at DESC);

-- 2. TABLE: assistant_messages (Per-user persistent chat history)
CREATE TABLE IF NOT EXISTS assistant_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tool_calls        JSONB,
  tool_call_id      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_id ON assistant_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created_at ON assistant_messages(created_at ASC);

-- 3. Enhance schedules table with optional assigned_to / user_id & lead_id
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Enhance tasks table with optional assigned_to & lead_id & channel
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. RLS Policies
ALTER TABLE assistant_tool_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - assistant_tool_logs" ON assistant_tool_logs;
DROP POLICY IF EXISTS "Service role full access - assistant_messages"  ON assistant_messages;

CREATE POLICY "Service role full access - assistant_tool_logs" ON assistant_tool_logs FOR ALL USING (true);
CREATE POLICY "Service role full access - assistant_messages"  ON assistant_messages  FOR ALL USING (true);

-- 6. Realtime (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE assistant_messages;
