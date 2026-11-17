-- ============================================================================
-- 008_app_settings.sql
-- Motivo: configurações operacionais (Meta CAPI, GA4, Digistore, cookie)
-- editáveis pelo dashboard em vez de env vars na Vercel. Valores lidos
-- server-side via src/lib/settings.ts com fallback pra process.env.
--
-- Contém segredos (META_ACCESS_TOKEN, passphrases) — por isso NENHUM acesso
-- via Data API pra anon/authenticated. Só service_role (API routes) lê/escreve.
--
-- Execução: cole o arquivo INTEIRO no SQL Editor do Supabase e rode.
-- ============================================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2) REVOKE ALL — zera defaults herdados antes de conceder
REVOKE ALL ON TABLE public.app_settings FROM anon, authenticated;

-- 3) authenticated: NADA — segredos nunca chegam ao browser via Data API.
--    O dashboard lê/escreve por /api/settings (service_role, com auth check).

-- 4) service_role: ALL explícito
GRANT ALL ON TABLE public.app_settings TO service_role;

-- 5) RLS habilitado, sem policies — anon/authenticated bloqueados;
--    service_role bypassa RLS por design.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 6) Policies: nenhuma de propósito (ver item 5).
