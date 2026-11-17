CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── LEADS ──────────────────────────────────────────────────────────────────
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT UNIQUE NOT NULL,
  email           TEXT,
  email_hash      TEXT,
  phone_hash      TEXT,
  first_name_hash TEXT,
  last_name_hash  TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  fbp             TEXT,
  fbc             TEXT,
  ip              TEXT,
  user_agent      TEXT,
  country         TEXT,
  state           TEXT,
  city            TEXT,
  pixel_id        TEXT,
  referrer        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── EVENTS_LOG ─────────────────────────────────────────────────────────────
CREATE TABLE events_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT,
  event_name    TEXT NOT NULL,
  event_id      TEXT UNIQUE NOT NULL,
  pixel_id      TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_term      TEXT,
  utm_content   TEXT,
  payload_meta  JSONB,
  response_meta JSONB,
  ip            TEXT,
  country       TEXT,
  state         TEXT,
  city          TEXT,
  referrer      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX events_log_user_id_idx    ON events_log(user_id);
CREATE INDEX events_log_event_name_idx ON events_log(event_name);
CREATE INDEX events_log_created_at_idx ON events_log(created_at DESC);

-- ─── PURCHASES ──────────────────────────────────────────────────────────────
CREATE TABLE purchases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   TEXT UNIQUE NOT NULL,
  user_id          TEXT,
  email            TEXT,
  email_hash       TEXT,
  phone_hash       TEXT,
  first_name_hash  TEXT,
  last_name_hash   TEXT,
  product_name     TEXT,
  product_id       TEXT,
  value            NUMERIC(10,2) NOT NULL,
  commission_value NUMERIC(10,2),
  currency         TEXT NOT NULL DEFAULT 'BRL',
  status           TEXT NOT NULL DEFAULT 'approved',
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT,
  utm_content      TEXT,
  fbp              TEXT,
  fbc              TEXT,
  country          TEXT,
  state            TEXT,
  city             TEXT,
  matched_lead     BOOLEAN NOT NULL DEFAULT FALSE,
  match_type       TEXT CHECK (match_type IN ('user_id', 'email', 'none')),
  meta_event_id    TEXT,
  response_meta    JSONB,
  raw_webhook      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX purchases_user_id_idx    ON purchases(user_id);
CREATE INDEX purchases_email_idx      ON purchases(email);
CREATE INDEX purchases_created_at_idx ON purchases(created_at DESC);
CREATE INDEX purchases_status_idx     ON purchases(status);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read leads"
  ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read events_log"
  ON events_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read purchases"
  ON purchases FOR SELECT TO authenticated USING (true);
