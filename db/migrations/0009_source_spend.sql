-- 0009_source_spend.sql — Phase 3B (LP Supabase)
--
-- Spend feed for Lead Cost / cost-as-%-of-revenue / ROMI. LP has no spend data, so
-- this is fed externally (LeadGurus ingest, Google/Meta exports, or a manual CSV).
-- lib/queries/leadcost.ts joins lp_source_scorecard_daily to this over the period.
-- Until a source has rows here, the Lead Cost UI shows "Spend not connected" rather
-- than a misleading 0%.
--
-- The existing LeadGurus feed (ft_daily_summary) is read directly for the "Lead Gurus"
-- source and does NOT need to be duplicated here. Idempotent.

CREATE TABLE IF NOT EXISTS lp_source_spend_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL,
  source text,
  sub_source text,
  spend_date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  raw_leads int,
  source_system text,                       -- 'leadgurus' | 'google_ads' | 'meta' | 'manual_csv'
  created_at timestamptz DEFAULT now(),
  UNIQUE (market, source, sub_source, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_source_spend_market_date
  ON lp_source_spend_daily (market, spend_date DESC);
