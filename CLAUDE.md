# CLAUDE.md

Instruções operacionais pra este projeto.

## Origem do código

Dash do **ILC Women 2**. Copiado em 2026-11-17 do tracker do ILC Women
(`serversideilcfem-tech/trackeamento-online-relationshipfeminine`), que por sua
vez segue o do URM Men (`serversideilcfem-tech/manconnection`). Mudança de
tracking feita lá deve ser trazida pra cá também.

- **Projeto Vercel:** `trackeamento-shebecomesconfident`, domínio do dash
  `https://data.shebecomesconfident.com`.
- **Supabase:** projeto `daotrjibwfufcytklgfh` (ilc-women-2).
- **Identidade git:** `user.name serversideilcfem-tech`,
  `user.email 284382109+serversideilcfem-tech@users.noreply.github.com` (local, não `--global`).

## Configurações via dashboard (app_settings)

Meta CAPI, TikTok Events API, GA4, Digistore, cookie domain e domínios do
cloaker são editados em `/dashboard/configuracoes` (tabela `app_settings`,
migration 008), com fallback pras env vars antigas da Vercel. Só os 3 envs do
Supabase são obrigatórios na Vercel. `/api/config` é público: nunca colocar
segredo nele.

## Plataforma, fuso e regras de envio

- Coluna `platform` (meta | tiktok), migration 009. Regra em `src/lib/platform.ts`:
  ttclid > fbclid > utm_source.
- Purchase vai só pra plataforma de origem; origem desconhecida vai pras duas.
- Pixel dispara só nas páginas de `META_PIXEL_DOMAINS` / `TIKTOK_PIXEL_DOMAINS`
  (vazio = todas).
- Fuso do dash: `Europe/Rome` (Itália) em `src/lib/utils.ts` — diferente dos outros dashes
  (URM `America/New_York`, ILC Women `America/Sao_Paulo`). Não sobrescrever ao sincronizar.
- Check: `node --no-warnings scripts/check-tracking-input.mjs`.

## Supabase — Padrão de criação de tabelas

A partir de 2026-10-30, o Supabase deixa de expor tabelas em `public`
automaticamente via Data API (PostgREST + GraphQL). Acesso passa a depender
de GRANTs explícitos por role.
Ref: https://supabase.com/blog/postgrest-explicit-grants

**Regra:** toda nova tabela em `public` DEVE incluir, na mesma migration:
1. `CREATE TABLE` + índices
2. `REVOKE ALL ... FROM anon, authenticated` (zera defaults herdados antes de conceder)
3. `GRANT ... TO authenticated` (conforme decisão abaixo)
4. `GRANT ALL ... TO service_role` (explícito, não confie no default)
5. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
6. `CREATE POLICY` pra cada operação permitida via authenticated

⚠ **Gotcha histórico:** o Supabase concedia `ALL` pra `authenticated` por default
em tabelas pré-existentes. Fazer só `GRANT SELECT` não revoga os outros
privilégios — sempre `REVOKE ALL` antes do `GRANT`. Ver
`sql/migrations/007_revoke_authenticated_writes.sql` pro caso histórico.

Não criar tabela em `public` sem esses 6 itens. Se for caso excepcional
(ex: leitura pública intencional como catálogo de produtos), documentar
o motivo num comentário no topo da migration.

### Decisões default por role

| Role            | Privilégio padrão           | Quando ajustar |
|-----------------|------------------------------|---|
| `anon`          | NADA (REVOKE ALL defensivo) | Só se a tabela for leitura pública INTENCIONAL (catálogo, posts publicados). Documentar no header. |
| `authenticated` | SELECT only                 | INSERT/UPDATE/DELETE só se houver caller browser que muta dados. Por padrão, mutações ficam em `/api/*` com service_role. |
| `service_role`  | ALL explícito               | Sempre. Mesmo sendo default do Supabase, explicitamos pra evitar regressão se a Supabase mudar defaults. |

### Template SQL pronto

Use este esqueleto pra novas tabelas. Substitua `<nome_tabela>` e ajuste
colunas/policies conforme a necessidade.

```sql
-- ============================================================================
-- 00X_<nome_tabela>.sql
-- Motivo: <descreva o que esta tabela armazena e por quê>
-- ============================================================================

-- 1) Schema
CREATE TABLE public.<nome_tabela> (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... outras colunas
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX <nome_tabela>_created_at_idx ON public.<nome_tabela>(created_at DESC);

-- 2) GRANTs (regra obrigatória — ver CLAUDE.md)
REVOKE ALL  ON TABLE public.<nome_tabela> FROM anon;
REVOKE ALL  ON TABLE public.<nome_tabela> FROM authenticated;
GRANT SELECT ON TABLE public.<nome_tabela> TO authenticated;
GRANT ALL    ON TABLE public.<nome_tabela> TO service_role;

-- 3) RLS
ALTER TABLE public.<nome_tabela> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read <nome_tabela>"
  ON public.<nome_tabela>
  FOR SELECT
  TO authenticated
  USING (true);

-- 4) Sequences (se houver SERIAL/BIGSERIAL — não usar UUID se incluir aqui):
-- GRANT USAGE, SELECT ON SEQUENCE public.<nome_tabela>_id_seq TO authenticated, service_role;
-- REVOKE ALL ON SEQUENCE public.<nome_tabela>_id_seq FROM anon;
```

### Convenção operacional

- **Pasta de migrations:** `sql/migrations/` (manual, não CLI). Padrão
  `NNN_descricao.sql`, sequencial.
- **Aplicação:** colar o arquivo INTEIRO no **SQL Editor** do Supabase
  (Dashboard → SQL Editor → New query → Run). Não usamos `supabase db push`.
- **Schema inicial:** `sql/schema.sql` (DDL fundacional das 3 tabelas
  atuais). Migrations evoluem a partir dele.

### Referência de exemplo

`sql/migrations/006_explicit_grants_data_api.sql` aplica essa regra
retroativamente às 3 tabelas que já existiam antes deste padrão
(`leads`, `events_log`, `purchases`). Use ele como referência de
estrutura, comentários e idempotência.
