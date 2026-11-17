-- ============================================================================
-- 009_tiktok_platform.sql
-- Motivo: TikTok Events API (ttclid/_ttp + payload/resposta) e coluna
-- `platform` ('meta' | 'tiktok') pro filtro Meta/TikTok/Tudo do dashboard.
--
-- Só ALTER em tabelas existentes — GRANTs/RLS de 006/007 continuam valendo.
-- Idempotente. Execução: cole o arquivo INTEIRO no SQL Editor do Supabase.
-- ============================================================================

-- 1) leads
ALTER TABLE public.leads      ADD COLUMN IF NOT EXISTS ttclid   TEXT;
ALTER TABLE public.leads      ADD COLUMN IF NOT EXISTS ttp      TEXT;
ALTER TABLE public.leads      ADD COLUMN IF NOT EXISTS platform TEXT;

-- 2) events_log
ALTER TABLE public.events_log ADD COLUMN IF NOT EXISTS platform        TEXT;
ALTER TABLE public.events_log ADD COLUMN IF NOT EXISTS payload_tiktok  JSONB;
ALTER TABLE public.events_log ADD COLUMN IF NOT EXISTS response_tiktok JSONB;

-- 3) purchases
ALTER TABLE public.purchases  ADD COLUMN IF NOT EXISTS ttclid          TEXT;
ALTER TABLE public.purchases  ADD COLUMN IF NOT EXISTS ttp             TEXT;
ALTER TABLE public.purchases  ADD COLUMN IF NOT EXISTS platform        TEXT;
ALTER TABLE public.purchases  ADD COLUMN IF NOT EXISTS response_tiktok JSONB;

-- 4) Valores válidos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_platform_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_platform_check CHECK (platform IN ('meta', 'tiktok'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_log_platform_check') THEN
    ALTER TABLE public.events_log ADD CONSTRAINT events_log_platform_check CHECK (platform IN ('meta', 'tiktok'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_platform_check') THEN
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_platform_check CHECK (platform IN ('meta', 'tiktok'));
  END IF;
END $$;

-- 5) Índices pro filtro do dashboard (sempre combinado com created_at)
CREATE INDEX IF NOT EXISTS events_log_platform_created_idx ON public.events_log(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_platform_created_idx  ON public.purchases(platform, created_at DESC);

-- 6) Backfill pelo utm_source (mesma regra de src/lib/platform.ts, sem click id)
UPDATE public.leads SET platform = CASE
  WHEN lower(utm_source) ~ '(tiktok|^tt$|^tt[_-])' THEN 'tiktok'
  WHEN lower(utm_source) ~ '(facebook|^fb|instagram|^ig$|^ig[_-]|meta)' OR fbc IS NOT NULL THEN 'meta'
END
WHERE platform IS NULL;

UPDATE public.events_log SET platform = CASE
  WHEN lower(utm_source) ~ '(tiktok|^tt$|^tt[_-])' THEN 'tiktok'
  WHEN lower(utm_source) ~ '(facebook|^fb|instagram|^ig$|^ig[_-]|meta)' THEN 'meta'
END
WHERE platform IS NULL;

UPDATE public.purchases SET platform = CASE
  WHEN lower(utm_source) ~ '(tiktok|^tt$|^tt[_-])' THEN 'tiktok'
  WHEN lower(utm_source) ~ '(facebook|^fb|instagram|^ig$|^ig[_-]|meta)' OR fbc IS NOT NULL THEN 'meta'
END
WHERE platform IS NULL;
