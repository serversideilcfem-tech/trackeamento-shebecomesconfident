# Trackeamento.Online — Reconnection Men

Inteligência ativa de rastreamento e atribuição. Plataforma interna de server-side tracking (sGTM-lite) com:

- Integração de checkout **Digistore24** (webhook SHA-512, `digistore24.com`).
- Envio de eventos para **Meta Conversions API** (CAPI).
- Envio paralelo para **Google Analytics 4 Measurement Protocol** + gtag client-side.

Stack: Next.js 14 (App Router), TypeScript, Supabase (Auth + Postgres + RLS), Tailwind, Radix UI, Recharts.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher valores
npm run dev
```

Abrir http://localhost:3000.

## Variáveis de ambiente

Ver [.env.example](./.env.example). Todas as chaves vão em `.env.local` (gitignored).

## Hardening pendente

- `next@14.2.35` tem CVEs de DoS (RSC / Server Components). Fix requer bump para `next@16` (major). Agendar upgrade em janela dedicada pós-launch.
- `glob` (dev dep via `eslint-config-next`) tem command injection no CLI — inexplorável em runtime. Resolve junto com o bump do Next.

## Estrutura

- `src/app/api/event/` — endpoint de eventos (PageView, InitiateCheckout) com envio Meta CAPI + GA4 MP.
- `src/app/api/webhook/digistore/` — webhook de compras Digistore24 (form-urlencoded + SHA-512 IPN).
- `src/app/api/uid/` — server-set do cookie `_rm_uid` (400 dias).
- `src/app/dashboard/` — dashboard protegido (Supabase Auth).
- `public/pulse.js` — client script (captura UTMs, decora links Digistore com `custom` field, dispara PageView/InitiateCheckout). Nome neutro p/ evitar blocklists.
- `sql/` — schema e migrations Postgres.

## Diferenças vs versão Kiwify

- Webhook recebe `application/x-www-form-urlencoded` (não JSON).
- Validação via SHA-512 de params ordenados + passphrase (campo `sha_sign` no body).
- Tracker injeta `custom=<user_id|utm_source|utm_medium|utm_campaign|utm_content|utm_term>` no link Digistore (tem só 1 campo custom).
- Valores em reais/dólares/euros (não centavos).
- Eventos tratados: `on_payment` / `on_rebill` (= approved), `on_refund`, `on_chargeback`.
