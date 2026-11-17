export type Platform = "meta" | "tiktok";

export const PLATFORMS: Platform[] = ["meta", "tiktok"];

// Click id manda (ttclid > fbclid); sem click id, cai no utm_source.
// ponytail: regex de utm_source cobre os valores comuns; ajustar se a
// nomenclatura dos anúncios usar outra coisa.
export function detectPlatform(input: {
  ttclid?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
}): Platform | null {
  if (input.ttclid) return "tiktok";
  if (input.fbclid) return "meta";
  const src = typeof input.utm_source === "string" ? input.utm_source.toLowerCase() : "";
  if (/tiktok|^tt$|^tt[_-]/.test(src)) return "tiktok";
  if (/facebook|^fb|instagram|^ig$|^ig[_-]|meta/.test(src)) return "meta";
  return null;
}

// Purchase (webhook) vai só pra plataforma de origem da compra: venda do
// TikTok não entra no pixel do Meta e vice-versa. Sem origem conhecida
// (lead não casou e utm_source não diz nada), manda pras duas — melhor
// sobrar evento sem atribuição do que perder a compra.
export function sendsTo(target: Platform, origin: Platform | null | undefined): boolean {
  return !origin || origin === target;
}

// Click ids / _ttp vêm do browser em endpoint público: descarta lixo
// (objeto, string gigante) antes de gravar ou repassar pra API.
// ttclid do TikTok tem ~300-350 chars — limite de 256 descartava todos.
export function cleanClickId(value: unknown): string | null {
  return typeof value === "string" && value.length <= 1024 && /^[\w.\-]+$/.test(value)
    ? value
    : null;
}

export function parsePlatform(value: string | undefined | null): Platform | undefined {
  return PLATFORMS.includes(value as Platform) ? (value as Platform) : undefined;
}
