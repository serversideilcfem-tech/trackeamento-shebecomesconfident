-- Adiciona coluna de comissão líquida do usuário em purchases.
-- commission_value = soma das comissões cujo source != 'MARKETPLACE'
-- (PRODUCER + AFFILIATE + CO_PRODUCER). Se não houver, fallback para value.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS commission_value NUMERIC(10,2);

-- Backfill a partir do raw_webhook.data.commissions
UPDATE purchases
SET commission_value = COALESCE(
  (
    SELECT SUM((c->>'value')::NUMERIC)
    FROM jsonb_array_elements(raw_webhook->'data'->'commissions') AS c
    WHERE c->>'source' IS NOT NULL
      AND c->>'source' <> 'MARKETPLACE'
  ),
  value
)
WHERE commission_value IS NULL;
