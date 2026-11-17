import crypto from "crypto";

/**
 * Assinatura SHA-512 do IPN genérico do Digistore24 (`sha_sign`).
 *
 * Mesmo algoritmo do receiver oficial (`digistore_signature` do ipn_receiver.php,
 * chamado com os defaults):
 *   1. Remove `sha_sign` / `SHASIGN`.
 *   2. Ordena as keys como vieram (ordem de bytes, sem mudar o case).
 *   3. Pula valores vazios.
 *   4. Para cada key: concatena `key=value` + passphrase (a passphrase vai
 *      depois de CADA par, inclusive o último; não há separador entre pares).
 *   5. SHA-512 do resultado, hex em maiúsculas.
 *
 * Ref: https://dev.digistore24.com/hc/en-us/articles/32480217565969-Quick-Integration-Guide
 */
export function digistoreSignature(
  params: Iterable<[string, string]>,
  passphrase: string
): string {
  const pairs = Array.from(params).filter(
    ([k, v]) => k !== "sha_sign" && k !== "SHASIGN" && v !== "" && v != null
  );
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const shaString = pairs.map(([k, v]) => `${k}=${v}${passphrase}`).join("");
  return crypto.createHash("sha512").update(shaString, "utf8").digest("hex").toUpperCase();
}

/** Valida o `sha_sign` recebido (comparação timing-safe). */
export function verifyDigistoreSignature(
  params: URLSearchParams,
  passphrase: string
): boolean {
  const received = (params.get("sha_sign") || params.get("SHASIGN") || "").toUpperCase();
  if (!received || !passphrase) return false;

  const computed = digistoreSignature(params.entries(), passphrase);

  // timingSafeEqual exige buffers do mesmo tamanho
  if (computed.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}
