# events_log — retenção (TTL parcial 30 dias)

## Racional

`events_log` cresce rápido (1 row por PageView + 1 por Purchase). Os campos
mais pesados são três JSONBs:

- `payload_meta`  — payload completo enviado à Meta CAPI
- `response_meta` — resposta da Meta CAPI
- `response_ga4`  — resposta do GA4 Measurement Protocol

Estes três campos só importam pra debug recente (validar evento perdido,
inspecionar payload de erro). Não alimentam nenhum dashboard.

Em vez de deletar a row inteira após 30 dias, **zeramos só esses três JSONBs**
e mantemos o resto (id, user_id, event_name, event_id, pixel_id, utm_\*, ip,
geo, referrer, created_at). Isso preserva:

- contagens (PageView/InitiateCheckout/Purchase) e funil
- atribuição UTM por campanha/medium/content
- busca por user_id ou IP no modal de detalhe de evento
- comparação YoY/MoM por contagem

E libera o disco em ~90% por row antiga (os JSONBs são o grosso).

## O que sacrifica

- Após 30 dias, abrir o modal de detalhe de um evento antigo mostra
  payload/response vazios. As outras infos da row permanecem.
- Debug de envio Meta/GA4 fica limitado à janela de 30 dias.

## Arquivos

- [`scripts/backup-events-log.ts`](../scripts/backup-events-log.ts) — dump
  NDJSON de rows elegíveis pré-execução. Roda local com `npx tsx`.
- [`sql/migrations/004_events_log_ttl_partial.sql`](../sql/migrations/004_events_log_ttl_partial.sql)
  — função de health + sweep histórico inicial (batches de 10k).
- [`sql/migrations/005_events_log_ttl_cron.sql`](../sql/migrations/005_events_log_ttl_cron.sql)
  — pg_cron + worker + schedule diário 03:00 UTC.

## Ordem de execução

1. **Backup local** (gera marker de auditoria, mesmo com 0 rows hoje):
   ```bash
   npx tsx scripts/backup-events-log.ts
   ```
   Saída em `backups/events_log/events_log_pre_ttl_<ISO>.ndjson`.
   Diretório `backups/` é gitignored.

2. **Migration 004** — cole no SQL Editor do Supabase e rode.
   Deve imprimir:
   ```
   NOTICE:  eligible rows for zeroing: 0
   NOTICE:  updated 0 rows total
   ```

3. **Health check**:
   ```sql
   SELECT * FROM events_log_storage_health();
   ```
   `rows_eligible_remaining` = 0, `last_cron_status` = `pg_cron not installed yet`.

4. **Migration 005** — cole no SQL Editor e rode. Cria pg_cron, worker e
   agenda o job. Termina com um SELECT mostrando o job ativo.

5. **Verificação**:
   ```sql
   SELECT jobid, jobname, schedule, active
   FROM cron.job
   WHERE jobname = 'events_log_ttl_partial';
   ```

## Runbook

### Pausar o cron sem remover
```sql
UPDATE cron.job SET active = false WHERE jobname = 'events_log_ttl_partial';
```

### Retomar
```sql
UPDATE cron.job SET active = true WHERE jobname = 'events_log_ttl_partial';
```

### Remover de vez
```sql
SELECT cron.unschedule('events_log_ttl_partial');
```

### Alterar a janela (ex: 60 dias)
Editar `INTERVAL '30 days'` em `events_log_ttl_partial_run()` (e na função
`events_log_storage_health()` se quiser refletir no health snapshot) e
rodar de novo a migration 005 (é CREATE OR REPLACE — idempotente).

### Alterar o horário (ex: 04:30 UTC)
```sql
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'events_log_ttl_partial'),
  schedule := '30 4 * * *'
);
```

### Rodar manualmente fora do schedule
```sql
SELECT events_log_ttl_partial_run();
```

## Monitoramento

### Saúde da tabela
```sql
SELECT * FROM events_log_storage_health();
```
Retorna total de rows, rows com JSONB ainda preenchido, rows elegíveis
restantes (deveria ficar próximo de 0 após o cron rodar), datas extremas,
tamanho atual da tabela, e última execução do cron.

### Histórico recente do cron
```sql
SELECT start_time, end_time, status, return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'events_log_ttl_partial'
ORDER BY start_time DESC
LIMIT 10;
```

### Alerta simples (eligible alto = cron não rodou)
Se `rows_eligible_remaining` > 50.000 por 2 dias seguidos, o cron parou
de rodar — abrir o painel do pg_cron no Supabase e checar `job_run_details`.

## Nota sobre tamanho da tabela

`UPDATE` em Postgres **não reclama espaço imediatamente** — as versões
antigas das rows viram tuplas mortas e são recicladas pelo autovacuum aos
poucos. Então `pg_total_relation_size('events_log')` pode demorar dias pra
encolher visivelmente após o sweep, mesmo com 100% dos JSONBs zerados.

Pra forçar a reclamação imediata (lock exclusivo, downtime na tabela):
```sql
VACUUM FULL events_log;
```
Não recomendado em horário comercial — pode demorar minutos e bloqueia
inserts. O autovacuum normal é suficiente em quase todo cenário.

Pra checar progresso do autovacuum:
```sql
SELECT relname, n_dead_tup, last_autovacuum, autovacuum_count
FROM pg_stat_user_tables
WHERE relname = 'events_log';
```
