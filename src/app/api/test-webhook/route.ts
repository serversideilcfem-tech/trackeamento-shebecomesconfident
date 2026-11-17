import { NextRequest, NextResponse } from "next/server";
import { digistoreSignature } from "@/lib/digistore-sign";
import { getSetting } from "@/lib/settings";
import { getSessionUser } from "@/lib/supabase";

/**
 * POST /api/test-webhook
 * Simula um webhook IPN da Digistore24 para testar o fluxo completo de Purchase.
 *
 * Body (todos opcionais):
 *   {
 *     user_id, email, first_name, last_name, phone, product_name, product_id,
 *     value, country, currency,
 *     event_type,      // "on_payment" | "on_rebill" | "on_refund" | "on_chargeback"
 *     transaction_id,  // se fornecido, usa esse (útil p/ idempotência / refund chain)
 *     tamper           // true = assinatura inválida (testar 401)
 *   }
 *
 * Constrói POST application/x-www-form-urlencoded contra /api/webhook/digistore
 * com `sha_sign` calculado pelo mesmo algoritmo do Digistore (src/lib/digistore-sign.ts).
 */

export async function POST(request: NextRequest) {
  // Injeta Purchase sintético (grava em purchases/events_log e dispara CAPI
  // real) — exige sessão do dashboard, senão qualquer um polui os dados.
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      user_id = "test-user-001",
      email = "teste@email.com",
      first_name = "Usuario",
      last_name = "Teste",
      phone = "11999999999",
      product_name = "Produto Teste",
      product_id = "PROD-TEST-001",
      value = 197.00,
      country = "BR",
      currency = "BRL",
      event_type = "on_payment",
      transaction_id: customTx,
      tamper = false,
    } = body;

    const transactionId: string = customTx || `TEST-${Date.now()}`;

    // `custom` field — mesma ordem que o tracker monta:
    // 0=user_id, 1=utm_source, 2=utm_medium, 3=utm_campaign, 4=utm_content, 5=utm_term
    const custom = [
      user_id,
      "teste",
      "webhook-sim",
      "test-campaign",
      "",
      "",
    ].join("|");

    // Usa nomes padrão do IPN Digistore (amount_brutto, amount_netto, amount_vendor)
    const grossStr = String(value);
    const vendorStr = String(Number(value) * 0.9);
    const params: Record<string, string> = {
      event: event_type,
      transaction_id: transactionId,
      order_id: transactionId,
      product_id: String(product_id),
      product_name: String(product_name),
      amount_brutto: grossStr,
      amount_netto: vendorStr,
      amount_vendor: vendorStr,
      currency: String(currency).toUpperCase(),
      email: String(email),
      address_first_name: String(first_name),
      address_last_name: String(last_name),
      address_phone_no: String(phone),
      address_country: String(country),
      address_state: "SP",
      address_city: "Sao Paulo",
      custom,
    };

    const passphrase = await getSetting("DIGISTORE_IPN_PASSPHRASE");
    if (!passphrase) {
      return NextResponse.json(
        { error: "DIGISTORE_IPN_PASSPHRASE não configurada (dash /dashboard/configuracoes)" },
        { status: 500 }
      );
    }

    const realSign = digistoreSignature(Object.entries(params), passphrase);
    params.sha_sign = tamper ? "INVALID_SIGNATURE_TAMPERED" : realSign;

    const form = new URLSearchParams(params).toString();

    const baseUrl = request.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/webhook/digistore`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const result = await res.json().catch(() => ({ parse_error: true }));

    return NextResponse.json({
      success: res.ok,
      transaction_id: transactionId,
      event_type,
      user_id,
      webhook_status: res.status,
      webhook_response: result,
      tampered: tamper,
      payload_sent: params,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
