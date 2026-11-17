// Status de envio de um evento pra cada plataforma.
//
// "skip" = o dash decidiu não enviar (página fora da lista do pixel, compra de
// outra plataforma, plataforma não configurada). Não é falha: não entra como
// "Falhou" na tabela nem derruba a taxa de envio.
export type SendStatus = "ok" | "skip" | "fail";

type Resp = Record<string, unknown> | null | undefined;

function skippedError(r: Resp): boolean {
  const err = r?.error;
  if (typeof err !== "string") return false;
  return (
    err.startsWith("skipped") ||
    err === "tiktok not configured" ||
    err.startsWith("missing META_PIXEL_ID")
  );
}

export function metaStatus(r: Resp): SendStatus {
  if (r?.events_received === 1) return "ok";
  if (!r || skippedError(r)) return "skip";
  return "fail";
}

export function ga4Status(r: Resp): SendStatus {
  if (r?.ok === true) return "ok";
  if (!r || r.skipped === true || skippedError(r)) return "skip";
  return "fail";
}

export function tiktokStatus(r: Resp): SendStatus {
  if (r?.code === 0) return "ok";
  if (!r || skippedError(r)) return "skip";
  return "fail";
}

/** Taxa de envio só entre os eventos que deveriam ir pra plataforma (ignora skip). */
export function sendRate(statuses: SendStatus[]): number {
  const due = statuses.filter(s => s !== "skip");
  if (due.length === 0) return 0;
  return (due.filter(s => s === "ok").length / due.length) * 100;
}

/** Motivo legível do skip/falha, pro title do badge. */
export function sendDetail(r: Resp): string | undefined {
  if (!r) return undefined;
  const e = r.error ?? r.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as Record<string, unknown>).message);
  return undefined;
}
