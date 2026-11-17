import { createAdminClient } from "./supabase";

// Configurações editáveis em /dashboard/configuracoes (tabela app_settings).
// Precedência: valor no banco > process.env (fallback pra Vercel env vars).

export const SETTING_KEYS = [
  "META_ACCESS_TOKEN",
  "META_PIXEL_ID",
  "META_TEST_EVENT_CODE",
  "GA4_MEASUREMENT_ID",
  "GA4_API_SECRET",
  "DIGISTORE_IPN_PASSPHRASE",
  "DIGISTORE_POSTBACK_SECRET",
  "DIGISTORE_ACCEPT_TEST",
  // "1" = Purchase só vai pros pixels se a venda bater com um lead deste dash
  // (vários dashes recebendo IPN do mesmo produto Digistore)
  "DIGISTORE_ONLY_MATCHED",
  "COOKIE_DOMAIN",
  "TIKTOK_PIXEL_ID",
  "TIKTOK_ACCESS_TOKEN",
  "TIKTOK_TEST_EVENT_CODE",
  "IGNORED_REFERRER_DOMAINS",
  // Domínios do TikTok quando a oferta/cloaker diferem do Meta (sem prefixo = Meta)
  "COOKIE_DOMAIN_TIKTOK",
  "IGNORED_REFERRER_DOMAINS_TIKTOK",
  // URLs (domínio/slug) onde cada pixel dispara (client + server). Vazio = todas.
  // Nome legado "_DOMAINS": aceita domínio puro ou domínio/slug.
  "META_PIXEL_DOMAINS",
  "TIKTOK_PIXEL_DOMAINS",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

// Nunca retornados ao browser no GET /api/settings (só hasValue)
export const SECRET_KEYS: SettingKey[] = [
  "META_ACCESS_TOKEN",
  "GA4_API_SECRET",
  "DIGISTORE_IPN_PASSPHRASE",
  "DIGISTORE_POSTBACK_SECRET",
  "TIKTOK_ACCESS_TOKEN",
];

// POST /api/settings recusa apagar estas chaves (sem elas o tracking quebra
// silenciosamente — ex: CAPI postaria em /v19.0/undefined/events)
export const REQUIRED_KEYS: SettingKey[] = ["META_PIXEL_ID"];

// ponytail: cache por instância serverless, TTL 60s — mudança no dash demora
// até 1 min pra valer em instâncias já quentes. Pub/sub se precisar de imediato.
const TTL_MS = 60_000;
let cache: { values: Record<string, string>; fetchedAt: number } | null = null;

export async function getAllSettings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.values;

  // try/catch cobre também throws síncronos (ex: createAdminClient sem env),
  // pra rotas sem try próprio (/api/uid) nunca 500arem por causa de settings
  try {
    const { data, error } = await createAdminClient()
      .from("app_settings")
      .select("key, value");
    if (error) throw error;

    const values: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.value) values[row.key] = row.value;
    }
    cache = { values, fetchedAt: Date.now() };
    return values;
  } catch (err) {
    console.error("[settings] fetch failed:", err);
    // Mantém cache velho se houver; senão vazio → fallback pra env
    return cache?.values ?? {};
  }
}

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const values = await getAllSettings();
  return values[key] || process.env[key] || undefined;
}

export function invalidateSettingsCache() {
  cache = null;
}
