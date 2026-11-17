-- ============================================================================
-- 005_events_log_ttl_cron.sql
--
-- Agendamento recorrente do TTL parcial em events_log.
-- Roda todo dia às 03:00 UTC e zera JSONBs em rows que cruzaram 30 dias.
--
-- Pré-requisito: 004_events_log_ttl_partial.sql já aplicado.
--
-- Idempotência: a extensão usa IF NOT EXISTS, a função usa CREATE OR REPLACE,
-- e o schedule é precedido por um unschedule por jobid (se existir).
-- Pode ser re-aplicado sem efeitos colaterais.
--
-- Rollback (pausar o cron):
--   SELECT cron.unschedule('events_log_ttl_partial');
--
-- Execução: cole o arquivo INTEIRO no SQL Editor do Supabase e rode.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Habilita pg_cron. Em Supabase Cloud, a extensão fica no schema cron.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- 2) Worker idempotente: zera JSONBs em rows > 30d, em batches de 10k.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events_log_ttl_partial_run()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - INTERVAL '30 days';
  v_batch  INTEGER;
  v_total  INTEGER := 0;
BEGIN
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
  END LOOP;
  RAISE NOTICE 'events_log_ttl_partial_run: zeroed % rows', v_total;
END;
$$;

COMMENT ON FUNCTION events_log_ttl_partial_run() IS
  'Worker do cron events_log_ttl_partial. Zera payload_meta/response_meta/response_ga4 em rows > 30d, em batches de 10k.';

-- ---------------------------------------------------------------------------
-- 3) (Re)agenda o job: 03:00 UTC diariamente.
--    Unschedule por jobid antes, pra suportar re-execução sem erro.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'events_log_ttl_partial';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
    RAISE NOTICE 'unscheduled previous job (jobid=%)', v_jobid;
  END IF;
END;
$$;

SELECT cron.schedule(
  'events_log_ttl_partial',
  '0 3 * * *',
  $$SELECT events_log_ttl_partial_run()$$
);

-- ---------------------------------------------------------------------------
-- 4) Verificação: deve retornar 1 linha.
-- ---------------------------------------------------------------------------
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'events_log_ttl_partial';
