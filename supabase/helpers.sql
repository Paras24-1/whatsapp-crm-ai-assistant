-- ============================================================
-- Additional SQL helpers — run after schema.sql
-- ============================================================

-- Function to increment unread count safely
CREATE OR REPLACE FUNCTION increment_unread(p_phone TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE phone_number = p_phone;
END;
$$ LANGUAGE plpgsql;
