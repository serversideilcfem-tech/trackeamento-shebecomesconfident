-- ============================================================================
-- 004_events_log_ttl_partial.sql
--
-- Estratégia: TTL PARCIAL em events_log.
-- Em rows com created_at < now() - INTERVAL '30 days', zerar APENAS as colunas
-- JSONB pesadas: payload_meta, response_meta, response_ga4. Todas as outras
-- colunas (id, user_id, event_name, event_id, pixel_id, utm_*, ip, geo,
-- referrer, created_at) são preservadas — alimentam os dashboards de janela
-- longa, contagens, atribuição UTM e busca por user_id/IP.
--
-- Esta migration faz o SWEEP HISTÓRICO inicial e instala a função de health.
-- O agendamento recorrente está em 005_events_log_ttl_cron.sql.
--
-- Idempotência: o UPDATE só toca rows com algum JSONB ainda NOT NULL, então
-- rodar essa migration N vezes seguidas resulta em 0 rows após a primeira.
--
-- Rollback: NÃO existe rollback automático — os JSONBs são apagados. Restore
-- requer o NDJSON gerado por scripts/backup-events-log.ts antes da execução.
-- Para restaurar uma row específica:
--   UPDATE events_log
--   SET payload_meta = '<json>'::jsonb, response_meta = '<json>'::jsonb,
--       response_ga4 = '<json>'::jsonb
--   WHERE id = '<uuid>';
--
-- Execução: cole o arquivo INTEIRO no SQL Editor do Supabase e rode.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Função de health: snapshot do estado da tabela e do cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events_log_storage_health()
RETURNS TABLE (
  total_rows               BIGINT,
  rows_with_any_jsonb      BIGINT,
  rows_eligible_remaining  BIGINT,
  rows_zeroed_post_cutoff  BIGINT,
  oldest_created_at        TIMESTAMPTZ,
  newest_created_at        TIMESTAMPTZ,
  table_size_pretty        TEXT,
  last_cron_run            TIMESTAMPTZ,
  last_cron_status         TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - INTERVAL '30 days';
BEGIN
  SELECT
    count(*),
    count(*) FILTER (
      WHERE payload_meta IS NOT NULL
         OR response_meta IS NOT NULL
         OR response_ga4 IS NOT NULL
    ),
    count(*) FILTER (
      WHERE created_at < v_cutoff
        AND (payload_meta IS NOT NULL
          OR response_meta IS NOT NULL
          OR response_ga4 IS NOT NULL)
    ),
    count(*) FILTER (
      WHERE created_at < v_cutoff
        AND payload_meta IS NULL
        AND response_meta IS NULL
        AND response_ga4 IS NULL
    ),
    min(created_at),
    max(created_at),
    pg_size_pretty(pg_total_relation_size('events_log'))
  INTO
    total_rows,
    rows_with_any_jsonb,
    rows_eligible_remaining,
    rows_zeroed_post_cutoff,
    oldest_created_at,
    newest_created_at,
    table_size_pretty
  FROM events_log;

  BEGIN
    SELECT start_time, status
    INTO last_cron_run, last_cron_status
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'events_log_ttl_partial'
    ORDER BY start_time DESC
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
      last_cron_run := NULL;
      last_cron_status := 'pg_cron not installed yet';
  END;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION events_log_storage_health() IS
  'Snapshot de tamanho/contagem da events_log + última execução do cron events_log_ttl_partial. Seguro de chamar antes do pg_cron existir.';

-- ---------------------------------------------------------------------------
-- 2) Sweep histórico: zera JSONBs em rows > 30 dias, em batches de 10k.
--    Hoje (tabela com ~22 dias de histórico): vai imprimir 0 batches.
--    O sistema fica armado — quando rows completarem 30d, o cron faz o resto.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cutoff       TIMESTAMPTZ := now() - INTERVAL '30 days';
  v_batch        INTEGER;
  v_total        INTEGER := 0;
  v_size_before  TEXT;
  v_size_after   TEXT;
  v_eligible     BIGINT;
BEGIN
  SELECT pg_size_pretty(pg_total_relation_size('events_log')) INTO v_size_before;

  SELECT count(*) INTO v_eligible
  FROM events_log
  WHERE created_at < v_cutoff
    AND (payload_meta IS NOT NULL
      OR response_meta IS NOT NULL
      OR response_ga4 IS NOT NULL);

  RAISE NOTICE 'events_log size before: %', v_size_before;
  RAISE NOTICE 'cutoff: created_at < %', v_cutoff;
  RAISE NOTICE 'eligible rows for zeroing: %', v_eligible;

  LOOP
    UPDATE events_log
    SET payload_meta = NULL,
        response_meta = NULL,
        response_ga4  = NULL
    WHERE id IN (
      SELECT id FROM events_log
      WHERE created_at < v_cutoff
        AND (payload_meta IS NOT NULL
          OR response_meta IS NOT NULL
          OR response_ga4 IS NOT NULL)
      LIMIT 10000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    EXIT WHEN v_batch = 0;
    v_total := v_total + v_batch;
    RAISE NOTICE 'batch updated: %, running total: %', v_batch, v_total;
  END LOOP;

  SELECT pg_size_pretty(pg_total_relation_size('events_log')) INTO v_size_after;
  RAISE NOTICE 'events_log size after: % (was %)', v_size_after, v_size_before;
  RAISE NOTICE 'updated % rows total', v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Health snapshot final.
-- ---------------------------------------------------------------------------
SELECT * FROM events_log_storage_health();
