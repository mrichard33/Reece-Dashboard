-- Customer Journey — per-contact read indexes.
-- Apply in the HL Supabase project (jtlngmcrtqncimtjjzlz), NOT LP.
--
-- RUN EACH STATEMENT AS ITS OWN EXECUTION in the dashboard SQL editor:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction, and the editor
-- wraps a multi-statement run in one. All are IF NOT EXISTS — safe to re-run.
--
-- WHY
-- The journey page (lib/journey/build.ts) reads one contact at a time from
-- lead_events (2.26M rows), messages (41K) and appointments (14K), newest
-- first, and the Leads tab pages contacts by (date_added DESC, ghl_contact_id
-- DESC). The code works without these — just slower — so there is no deploy
-- ordering to get wrong.
--
-- WHAT WAS ALREADY THERE (pg_indexes, 2026-09-24) — and so is NOT repeated:
--   * contacts:      idx_contacts_tags  GIN (tags)       ← the spec's #5
--   * opportunities: idx_opportunities_contact (ghl_contact_id) ← the spec's #4
--   * lead_events:   idx_lead_events_contact (contact_id) — no time order, so
--                    "newest N for one contact" still sorts every row it has.
--   * messages:      no contact index at all — every journey scanned the table.

-- 1. Newest events for one contact (journey + the list's "Last activity").
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_events_contact_time_idx
  ON lead_events (contact_id, event_time DESC);

-- 2. Newest messages for one contact.
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_contact_sent_idx
  ON messages (ghl_contact_id, sent_at DESC) WHERE deleted_at IS NULL;

-- 3. A contact's appointments by start (Now → next appointment).
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_contact_start_idx
  ON appointments (ghl_contact_id, start_time DESC) WHERE deleted_at IS NULL;

-- 4. The Leads tab keyset.
CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_date_added_idx
  ON contacts (date_added DESC, ghl_contact_id DESC) WHERE deleted_at IS NULL;

-- Verify (one contact should use lead_events_contact_time_idx):
--   EXPLAIN SELECT event_time FROM lead_events
--   WHERE contact_id = 'gkJmc5DPc3nHXoevNH5K' ORDER BY event_time DESC LIMIT 1;
