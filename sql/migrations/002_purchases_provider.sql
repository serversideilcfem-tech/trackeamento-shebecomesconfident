-- Adiciona coluna provider em purchases para rastrear origem do pedido.
-- Default 'digistore' porque esta instância atende apenas Digistore24.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'digistore';

COMMENT ON COLUMN purchases.transaction_id IS
  'Identificador único do pedido. Para provider=digistore, recebe o transaction_id da Digistore24.';

COMMENT ON COLUMN purchases.provider IS
  'Origem do pedido. Ex: digistore. Use para segmentar queries quando houver múltiplos providers.';

CREATE INDEX IF NOT EXISTS purchases_provider_idx ON purchases(provider);
