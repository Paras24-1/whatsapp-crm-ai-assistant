-- ============================================================
-- WhatsApp AI CRM - Complete Supabase Master Database Setup
-- Copy and run this ENTIRE script in Supabase SQL Editor
-- (https://supabase.com/dashboard/project/_/sql)
-- Safe to re-run multiple times
-- ============================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. TABLE: users (CRM Team Members & Roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  avatar        TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. TABLE: conversations (WhatsApp Chats)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number      TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL DEFAULT 'Unknown',
  last_message      TEXT,
  unread_count      INTEGER NOT NULL DEFAULT 0,
  ai_mode           BOOLEAN NOT NULL DEFAULT TRUE,
  stage             TEXT NOT NULL DEFAULT 'new',
  notes             TEXT,
  assigned_to       TEXT,
  assignment_status TEXT DEFAULT 'unassigned',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. TABLE: messages (Chat History)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  phone_number    TEXT NOT NULL,
  message         TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  media_url       TEXT,
  media_type      TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. TABLE: leads (Full CRM Customer Records)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id       UUID UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  phone_number          TEXT NOT NULL,
  name                  TEXT,
  stage                 TEXT NOT NULL DEFAULT 'new',
  source                TEXT DEFAULT 'WhatsApp Direct',
  company_name          TEXT,
  address               TEXT,
  city                  TEXT,
  budget                TEXT,
  notes                 TEXT,
  followup_date         TIMESTAMPTZ,
  followup_notes        TEXT,
  followup_notified     BOOLEAN DEFAULT FALSE,
  assigned_to           TEXT,
  lead_score            INTEGER DEFAULT 0,
  lead_quality          TEXT,
  lead_type             TEXT,
  machine_interest      TEXT,
  callback_ready        TEXT,
  conversation_summary  TEXT,
  checkin_date          DATE,
  checkout_date         DATE,
  room_type             TEXT,
  num_guests            INTEGER,
  metadata              JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. TABLE: schedules (Meetings, Events, Follow-up Reminders)
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL DEFAULT 'reminder' CHECK (type IN ('reminder', 'meeting', 'event', 'lead', 'holiday', 'service')),
  title         TEXT NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  description   TEXT,
  location      TEXT,
  end_time      TIMESTAMPTZ,
  notes         TEXT,
  assigned_to   TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. TABLE: tasks (Kanban Tasks & Assigned Follow-ups)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  assigned_to   TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  channel       TEXT,
  notes         TEXT,
  priority      TEXT DEFAULT 'medium',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. TABLE: todos (Personal Daily Action Items)
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. TABLE: notes (Dashboard Sticky Notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content       TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT 'green',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. TABLE: invoices (Bills, Tax Invoices & Quotations)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT,
  customer_email  TEXT,
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '7 days')::DATE,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 18,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'partially_paid', 'overdue', 'draft')),
  items           JSONB DEFAULT '[]'::jsonb,
  notes           TEXT,
  is_quotation    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. TABLE: assistant_tool_logs (Audit Trail for AI Actions)
-- ============================================================
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

-- ============================================================
-- 11. TABLE: assistant_messages (Persistent AI Chat History)
-- ============================================================
CREATE TABLE IF NOT EXISTS assistant_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tool_calls        JSONB,
  tool_call_id      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_conversation_id ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON schedules(scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_assistant_tool_logs_created_at ON assistant_tool_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_id ON assistant_messages(user_id);

-- ============================================================
-- 13. AUTO-UPDATE TIMESTAMPS TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_tool_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access - users"               ON users;
DROP POLICY IF EXISTS "Service role full access - conversations"       ON conversations;
DROP POLICY IF EXISTS "Service role full access - messages"            ON messages;
DROP POLICY IF EXISTS "Service role full access - leads"               ON leads;
DROP POLICY IF EXISTS "Service role full access - schedules"           ON schedules;
DROP POLICY IF EXISTS "Service role full access - tasks"               ON tasks;
DROP POLICY IF EXISTS "Service role full access - todos"               ON todos;
DROP POLICY IF EXISTS "Service role full access - notes"               ON notes;
DROP POLICY IF EXISTS "Service role full access - invoices"            ON invoices;
DROP POLICY IF EXISTS "Service role full access - assistant_tool_logs" ON assistant_tool_logs;
DROP POLICY IF EXISTS "Service role full access - assistant_messages"  ON assistant_messages;

CREATE POLICY "Service role full access - users"               ON users               FOR ALL USING (true);
CREATE POLICY "Service role full access - conversations"       ON conversations       FOR ALL USING (true);
CREATE POLICY "Service role full access - messages"            ON messages            FOR ALL USING (true);
CREATE POLICY "Service role full access - leads"               ON leads               FOR ALL USING (true);
CREATE POLICY "Service role full access - schedules"           ON schedules           FOR ALL USING (true);
CREATE POLICY "Service role full access - tasks"               ON tasks               FOR ALL USING (true);
CREATE POLICY "Service role full access - todos"               ON todos               FOR ALL USING (true);
CREATE POLICY "Service role full access - notes"               ON notes               FOR ALL USING (true);
CREATE POLICY "Service role full access - invoices"            ON invoices            FOR ALL USING (true);
CREATE POLICY "Service role full access - assistant_tool_logs" ON assistant_tool_logs FOR ALL USING (true);
CREATE POLICY "Service role full access - assistant_messages"  ON assistant_messages  FOR ALL USING (true);

-- ============================================================
-- 15. ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE assistant_messages;

-- ============================================================
-- 16. OPTIONAL SAMPLE DATA FOR INSTANT TESTING
-- ============================================================
INSERT INTO conversations (id, phone_number, name, last_message, stage, ai_mode)
VALUES 
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '+919876543210', 'Rahul Sharma', 'I want to confirm the deluxe room package', 'interested', true),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '+919812345678', 'Priya Patel',  'Please schedule a callback for tomorrow',   'followup',   true),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '+919898989898', 'Amit Singh',   'Payment confirmed for booking #102',        'confirmed',  false)
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO leads (conversation_id, phone_number, name, stage, source, lead_score, lead_quality, followup_date, followup_notes)
VALUES 
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '+919876543210', 'Rahul Sharma', 'interested', 'WhatsApp Direct', 85, 'hot', NOW() + INTERVAL '1 day', '[WhatsApp] Discuss final pricing'),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '+919812345678', 'Priya Patel',  'followup',   'Website Form',    70, 'warm', NOW() + INTERVAL '2 days', '[Manual Call] Product demo follow-up'),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', '+919898989898', 'Amit Singh',   'confirmed',  'Google Ads',      95, 'hot', NULL, NULL)
ON CONFLICT (conversation_id) DO NOTHING;

INSERT INTO schedules (title, type, scheduled_at, location, notes)
VALUES 
  ('Client Demo with Rahul Sharma', 'meeting', NOW() + INTERVAL '4 hours', 'Google Meet', 'Demo walkthrough of CRM features'),
  ('Follow-up Call with Priya Patel', 'reminder', NOW() + INTERVAL '1 day', 'WhatsApp Call', 'Check on proposal status')
ON CONFLICT DO NOTHING;

INSERT INTO tasks (title, due_date, status, channel, priority)
VALUES 
  ('Send quotation to Rahul Sharma', CURRENT_DATE, 'pending', 'whatsapp', 'high'),
  ('Review pipeline report with management', CURRENT_DATE + 1, 'pending', 'manual', 'medium')
ON CONFLICT DO NOTHING;
