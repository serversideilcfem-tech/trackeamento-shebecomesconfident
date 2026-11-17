export async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Normaliza telefone para E.164 sem o "+" (formato esperado pela Meta CAPI).
// - Remove tudo que não é dígito.
// - Para BR: prefixa 55 se o número estiver sem DDI (10-11 dígitos).
//   Se já tem DDI (12-13 dígitos começando com 55), devolve como está.
// - Para EUA/Canadá (DDI 1): prefixa 1 se vierem só os 10 dígitos nacionais.
//   Comprador americano costuma digitar sem o +1; sem o DDI o hash não casa
//   no Meta/TikTok.
// - Para outros países, devolve só os dígitos (presume DDI no input).
//
// Nota sobre plataformas de checkout BR:
// - Alguns painéis enviam phone sem DDI (ex: 11987654321) em testes.
// - Produção real geralmente envia com "+" e DDI (ex: +5554987654321).
// - DDD 55 existe (Santa Maria/RS), então não podemos usar só startsWith("55")
//   para detectar DDI — precisa checar o length.
export function normalizePhone(
  phone: string | null | undefined,
  country: string | null | undefined = "BR"
): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  const c = (country || "").toString().trim();
  const isBR = c.toUpperCase() === "BR" || c.toLowerCase() === "brasil";
  if (!isBR) {
    // EUA e Canadá compartilham o DDI 1 e o número nacional de 10 dígitos
    const isNANP = c.toUpperCase() === "US" || c.toUpperCase() === "CA";
    return isNANP && digits.length === 10 ? "1" + digits : digits;
  }
  const hasDDI = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  return hasDDI ? digits : "55" + digits;
}
