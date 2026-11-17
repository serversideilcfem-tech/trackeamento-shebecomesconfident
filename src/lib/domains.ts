// Listas de domínio do dash ("a.com, .b.com, https://c.com/x") → ["a.com", "b.com", "c.com"].
// Ponto inicial, protocolo e caminho são opcionais no dash; aqui saem sempre
// sem (pulse.js compara sufixo com "." + domínio).
export function parseDomains(...values: (string | undefined)[]): string[] {
  return values
    .join(",")
    .split(",")
    .map((d) =>
      d.trim().toLowerCase()
        .replace(/^[a-z]+:\/\//, "")
        .replace(/[/:].*$/, "")
        .replace(/^\.+/, "")
    )
    .filter(Boolean);
}

// URLs onde cada pixel dispara ("https://www.a.com/met/, b.com/recover")
// → ["www.a.com/met", "b.com/recover"]. Sem caminho = domínio inteiro.
export function parsePixelUrls(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((u) =>
      u.trim().toLowerCase()
        .replace(/^[a-z]+:\/\//, "")
        .replace(/[?#].*$/, "")
        .replace(/:\d+/, "")
        .replace(/^\.+/, "")
        .replace(/\/+$/, "")
    )
    .filter(Boolean);
}

// Pixel dispara só se host = domínio (ou subdomínio) e o caminho começa
// pelo slug configurado (por segmento: /met casa /met e /met/x, não /metx).
// Lista vazia = todas as páginas. Mesma regra em pulse.js (pixelAllowed).
export function urlAllowed(host: string, path: string, rules: string[]): boolean {
  if (!rules.length) return true;
  const h = host.toLowerCase();
  const p = path.toLowerCase().replace(/\/+$/, "");
  return rules.some((r) => {
    const i = r.indexOf("/");
    const d = i < 0 ? r : r.slice(0, i);
    const slug = i < 0 ? "" : r.slice(i);
    return (h === d || h.endsWith("." + d)) && (!slug || p === slug || p.startsWith(slug + "/"));
  });
}

// Cookie vai no domínio configurado que contém o host da requisição
// (data.<dominio> que serviu o pulse.js). Sem match → undefined (cookie
// host-only): browser recusa Set-Cookie com domínio de outro site.
export function cookieDomainFor(host: string, domains: string[]): string | undefined {
  const h = host.toLowerCase();
  const match = domains.find((d) => h === d || h.endsWith("." + d));
  return match ? "." + match : undefined;
}
