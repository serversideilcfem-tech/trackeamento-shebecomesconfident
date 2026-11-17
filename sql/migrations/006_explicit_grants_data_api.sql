-- ============================================================================
-- 006_explicit_grants_data_api.sql
--
-- Motivo: a partir de 2026-10-30 o Supabase deixa de expor automaticamente
-- tabelas em `public` via Data API (PostgREST /rest/v1/ e GraphQL /graphql/v1/).
-- O acesso passa a depender de GRANTs explícitos por role.
-- Ref: https://supabase.com/blog/postgrest-explicit-grants
--
-- Esta migration adequa as 3 tabelas em public (leads, events_log, purchases)
-- ao novo modelo:
--   - anon:          nada (REVOKE ALL defensivo; nenhum caller anon no projeto)
--   - authenticated: SELECT only (único caller browser é o modal de detalhe
--                    de evento, que apenas lê)
--   - service_role:  ALL explícito (todas as mutações vêm de API routes via
--                    createAdminClient com service_role; default hoje, mas
--                    explicitamos pra eliminar ambiguidade)
--
-- RLS é reativado idempotente nas 3 tabelas. Policies existentes
-- ("Authenticated read leads/events_log/purchases" — schema.sql:109-114)
-- permanecem inalteradas — GRANT é uma camada ortogonal a RLS.
--
-- Idempotência: REVOKE/GRANT/ALTER ENABLE RLS são todos no-op se já no estado
-- desejado. Pode ser re-aplicado sem efeitos colaterais.
--
-- Rollback: ver bloco no final do arquivo (comentado).
--   - Antes de 2026-10-30: rollback é seguro (defaults do Supabase cobrem).
--   - Depois de 2026-10-30: rollback derruba acesso à Data API e quebra o app.
--
-- Execução: cole o arquivo INTEIRO no SQL Editor do Supabase e rode.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) REVOKE em anon: nenhum caller usa o role anon pra Data API neste projeto.
--    Login/signOut usam /auth/v1/ (Auth API, fora do escopo desta mudança).
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.leads       FROM anon;
REVOKE ALL ON TABLE public.events_log  FROM anon;
REVOKE ALL ON TABLE public.purchases   FROM anon;

-- ---------------------------------------------------------------------------
-- 2) GRANT SELECT em authenticated: o usuário logado do dashboard pode ler
--    via browser. Único caller hoje: src/components/event-detail-modal.tsx
--    (linhas 64-66). Nenhuma mutação browser — não há INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.leads       TO authenticated;
GRANT SELECT ON TABLE public.events_log  TO authenticated;
GRANT SELECT ON TABLE public.purchases   TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) GRANT ALL em service_role: todas as mutações vêm de API routes que
--    usam createAdminClient() (src/lib/supabase.ts) com SUPABASE_SERVICE_ROLE_KEY.
--    Endpoints: /api/event, /api/lead, /api/postback/digistore,
--    /api/webhook/digistore. Server pages /dashboard/* também usam admin
--    pra leitura (no-store cache).
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.leads       TO service_role;
GRANT ALL ON TABLE public.events_log  TO service_role;
GRANT ALL ON TABLE public.purchases   TO service_role;

-- ---------------------------------------------------------------------------
-- 4) RLS reativado (idempotente).
--    Policies existentes em schema.sql:109-114 permanecem — não recriadas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5) Sequences: NÃO APLICÁVEL neste projeto.
--    Todas as PKs são `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. Nenhum
--    SERIAL/BIGSERIAL/IDENTITY. Quando criar tabelas com sequences no futuro,
--    incluir aqui:
--      GRANT USAGE, SELECT ON SEQUENCE public.<seq> TO authenticated, service_role;
--    (anon: REVOKE ALL ON SEQUENCE ...; defensivo.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6) Policies preservadas: as policies definidas em sql/schema.sql:109-114
--    continuam ativas após esta migration. Nenhum CREATE/DROP POLICY aqui.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK (apenas referência — não executar sem necessidade):
--
--   -- Pré-2026-10-30: defaults do Supabase cobrem; rollback é seguro.
--   -- Pós-2026-10-30: este rollback DERRUBA acesso à Data API e QUEBRA o app.
--
--   GRANT ALL ON TABLE public.leads      TO anon;
--   GRANT ALL ON TABLE public.events_log TO anon;
--   GRANT ALL ON TABLE public.purchases  TO anon;
--   REVOKE ALL ON TABLE public.leads      FROM authenticated;
--   REVOKE ALL ON TABLE public.events_log FROM authenticated;
--   REVOKE ALL ON TABLE public.purchases  FROM authenticated;
--   -- (service_role mantém ALL — bypassa GRANT por design Supabase)
-- ---------------------------------------------------------------------------
