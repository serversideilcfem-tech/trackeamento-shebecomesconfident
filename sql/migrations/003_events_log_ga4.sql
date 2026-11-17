-- Adiciona coluna para logar a resposta do GA4 Measurement Protocol
-- junto com a resposta já existente da Meta CAPI.

ALTER TABLE events_log
  ADD COLUMN IF NOT EXISTS response_ga4 JSONB;

COMMENT ON COLUMN events_log.response_ga4 IS
  'Resposta do envio para GA4 Measurement Protocol. Shape: { ok, status, skipped?, error? }. NULL para eventos anteriores à integração GA4.';
