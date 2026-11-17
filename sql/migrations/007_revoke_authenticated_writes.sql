-- ============================================================================
-- 007_revoke_authenticated_writes.sql
--
-- Corrige divergência detectada após aplicar 006_explicit_grants_data_api.sql:
-- o role `authenticated` aparecia com TODOS os privilégios (DELETE, INSERT,
-- REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE) nas 3 tabelas em public,
-- em vez de SELECT only conforme intenção da 006.
--
-- Causa: Supabase historicamente concedia ALL a authenticated por default
-- nas tabelas em public. A migration 006 fez GRANT SELECT (no-op se já
-- existia) mas não revogou os privilégios herdados.
--
-- Esta migration zera o estado de authenticated e re-concede só SELECT.
--
-- Impacto operacional: zero.
--   - Único caller browser (src/components/event-detail-modal.tsx:64-66)
--     só faz SELECT — continua funcionando.
--   - RLS já bloqueava INSERT/UPDATE/DELETE pra authenticated (só existe
--     policy de SELECT) — o app nunca dependeu desses grants extras.
--   - Endpoints /api/* usam service_role, não afetados.
--
-- O ganho é "defesa em profundidade": se um dia alguém desabilitar RLS ou
-- criar policy permissiva por engano, o browser não passa a poder mutar.
--
-- Idempotente: REVOKE ALL + GRANT SELECT pode ser re-aplicado sem efeito.
--
-- Rollback (não recomendado — reabre superfície de ataque):
--   GRANT ALL ON TABLE public.leads      TO authenticated;
--   GRANT ALL ON TABLE public.events_log TO authenticated;
--   GRANT ALL ON TABLE public.purchases  TO authenticated;
--
-- Execução: cole o arquivo INTEIRO no SQL Editor do Supabase e rode.
-- ============================================================================

REVOKE ALL ON TABLE public.leads       FROM authenticated;
REVOKE ALL ON TABLE public.events_log  FROM authenticated;
REVOKE ALL ON TABLE public.purchases   FROM authenticated;

GRANT SELECT ON TABLE public.leads       TO authenticated;
GRANT SELECT ON TABLE public.events_log  TO authenticated;
GRANT SELECT ON TABLE public.purchases   TO authenticated;

-- Validar (cole numa nova query depois de rodar):
--
-- SELECT grantee, table_name,
--        string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN ('leads', 'events_log', 'purchases')
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- GROUP BY grantee, table_name
-- ORDER BY table_name, grantee;
--
-- Esperado: authenticated com privileges = 'SELECT' (3 linhas).
