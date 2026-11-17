# Guia de Troca de Domínio

Como migrar de um domínio/subdomínio para outro sem perder dados nem quebrar o tracking.

**Cenário exemplo**: trocar de `dash.reconnectionmen.com` → `pulse.novodominio.com`

---

## Checklist resumido

- [ ] 1. DNS — novo CNAME apontando pra Vercel
- [ ] 2. Vercel — adicionar novo domínio (manter o antigo durante transição)
- [ ] 3. Vercel — atualizar `COOKIE_DOMAIN` se o **domínio raiz** mudar
- [ ] 4. Vercel — redeploy pra aplicar env var
- [ ] 5. Supabase — Auth URL Configuration (Site URL + Redirect URLs)
- [ ] 6. Digistore — Postback URL no painel
- [ ] 7. Landing page — atualizar `src` do `<script>` pulse.js
- [ ] 8. Monitorar 24–48h
- [ ] 9. Remover domínio antigo do Vercel (opcional, após validar)

**Tempo total**: ~30 min ativos + esperar propagação DNS/SSL (até 10 min).
**Reversível**: sim, até o passo 9.

---

## Passo a passo

### 1. DNS

No provedor DNS do novo domínio, adiciona:

```
Tipo:  CNAME
Nome:  pulse            (ou o subdomínio que você escolher)
Valor: cname.vercel-dns.com
TTL:   300 (ou automático)
```

Verifica propagação: `nslookup pulse.novodominio.com` até aparecer Vercel.

### 2. Vercel — adicionar novo domínio

**Vercel Dashboard → Project → Settings → Domains → Add Domain**:

```
pulse.novodominio.com
```

Vercel verifica + emite SSL em ~1min. **Mantém o domínio antigo ativo** na lista por enquanto.

### 3. Vercel — `COOKIE_DOMAIN` (se raiz mudou)

Se estava `.reconnectionmen.com` → agora `.novodominio.com`:

**Settings → Environment Variables** → edita `COOKIE_DOMAIN`:

```
.novodominio.com
```

(com ponto inicial — permite subdomínios compartilharem cookies)

**Se só o subdomínio mudou** (ex: `dash.dominio.com` → `pulse.dominio.com`), **não precisa mexer** — `COOKIE_DOMAIN=.dominio.com` já cobre ambos.

### 4. Vercel — redeploy

Após mudar env var, Vercel não reprocessa automaticamente. Triggera:

**Deployments → último deploy → menu "⋯" → Redeploy** (ou `git commit --allow-empty -m "trigger redeploy"; git push`).

### 5. Supabase Auth URL Configuration

**Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://pulse.novodominio.com`
- **Redirect URLs** (adicionar, NÃO trocar):
  - `https://pulse.novodominio.com/**`
  - `https://dash.reconnectionmen.com/**` (manter antigo durante transição)
  - `http://localhost:3000/**` (dev)

Depois de validar, remove o antigo.

### 6. Digistore — Postback URL

**Digistore Vendor Dashboard → S2S Postbacks → edita o postback existente**:

URL antiga:
```
https://dash.reconnectionmen.com/api/postback/digistore?secret=...&event={transaction_type}&...
```

URL nova (mesmo path, só troca o host):
```
https://pulse.novodominio.com/api/postback/digistore?secret=...&event={transaction_type}&...
```

Mantém o **mesmo `secret`** — não precisa trocar nada no `.env.local` nem Vercel.

Depois **Test Postback** pra validar 2xx.

### 7. Landing page — `<script>` do tracker

Atualiza o `src` em toda landing que usa o tracker (Atomicat, tema, etc):

**Antes:**
```html
<script
  src="https://dash.reconnectionmen.com/pulse.js"
  data-pixel-id="..."
  data-ga4-id="..."
  async></script>
```

**Depois:**
```html
<script
  src="https://pulse.novodominio.com/pulse.js"
  data-pixel-id="..."
  data-ga4-id="..."
  async></script>
```

**Atenção**: se o domínio raiz mudou, visitantes antigos perdem o `_rm_uid` cookie (`.reconnectionmen.com` ≠ `.novodominio.com`). Vão receber user_id novo ao acessar a nova landing. Não quebra nada, só reinicia a identificação daquele visitante específico.

### 8. Monitorar

Primeiras 24–48h, acompanha no dashboard:

- `/dashboard/eventos` — PageViews e InitiateCheckout chegando
- `/dashboard/compras` — compras novas com `response_ga4.ok=true` e `events_received=1`
- Meta Events Manager → Test Events — PageView + Purchase chegando

Se qualquer métrica cair pra zero → DNS/propagação não completou ou algum passo ficou pra trás.

### 9. Remover domínio antigo (opcional)

Após validar tráfego estável no novo domínio por alguns dias:

- **Vercel → Domains** — remove `dash.reconnectionmen.com`
- **Supabase → URL Configuration** — remove `https://dash.reconnectionmen.com/**`
- **DNS antigo** — pode remover ou apontar pra Vercel com redirect 301

---

## Coisas que NÃO precisam mudar

| Item | Motivo |
|---|---|
| `META_ACCESS_TOKEN` | Token é do System User, não amarrado a domínio |
| `META_PIXEL_ID` | Pixel ID não depende de domínio |
| `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` | Measurement protocol usa ID, não domínio |
| `DIGISTORE_IPN_PASSPHRASE` | Passphrase da conta Digistore |
| `DIGISTORE_POSTBACK_SECRET` | Secret do postback, não depende de host |
| Schema Supabase + migrations | Dados e tabelas são agnósticos |
| Usuário admin Supabase | Account-level, não por domínio |
| Código do projeto | Nada hardcoded pro domínio — tudo via `COOKIE_DOMAIN` |

---

## Rollback de emergência

Se algo quebrar e precisar voltar pro domínio antigo:

1. Vercel Domains → confirma que o antigo ainda está ativo
2. Digistore → edita postback URL de volta pro antigo
3. Landing → volta o `<script src>` pro antigo
4. `COOKIE_DOMAIN` → volta pro antigo, redeploy

Sem perda de dados — o backend continua o mesmo, só muda a "porta de entrada".

---

## Troubleshooting

### Cookie `_rm_uid` não aparece na landing nova

- Verifica `COOKIE_DOMAIN` no Vercel env → deve começar com `.` e ser o **root** do novo domínio
- Verifica se `https://pulse.novodominio.com/api/uid` responde 200 com `Set-Cookie: _rm_uid=...`
- Se `Domain=` no cookie não bate com o site, browser rejeita silenciosamente

### Postback Digistore retorna 401

- Confirma que `secret=` no URL do postback ainda é o valor de `DIGISTORE_POSTBACK_SECRET` na Vercel
- Em **Settings → Environment Variables** do Vercel, confere o valor (clica "Show")

### Dashboard redireciona pra login quebrado

- Supabase URL Configuration não tem o novo domínio em Redirect URLs
- Adiciona `https://pulse.novodominio.com/**` e refaz login

### Meta CAPI começa a falhar

- Não relacionado a domínio — verifica se `META_ACCESS_TOKEN` não expirou
- Events Manager → Settings → Access Token → testa validade

---

## Comandos úteis

```bash
# Verificar DNS propagou
nslookup pulse.novodominio.com
dig pulse.novodominio.com CNAME

# Testar endpoint live
curl -sS -i https://pulse.novodominio.com/api/uid

# Testar postback (com secret)
curl -sS "https://pulse.novodominio.com/api/postback/digistore?secret=XXX&event=payment&transaction_id=migration-test&is_test=1"
# Esperado: {"success":true,"ignored":"test_payment"}
```
