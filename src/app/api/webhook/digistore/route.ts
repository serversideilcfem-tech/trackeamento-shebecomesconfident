import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyDigistoreSignature } from "@/lib/digistore-sign";
import { sha256, normalizePhone } from "@/lib/hash";
import { sendMetaCAPI } from "@/lib/meta-capi";
import { sendGA4Event } from "@/lib/ga4-mp";
import { getSetting } from "@/lib/settings";
import { sendTikTokEvent } from "@/lib/tiktok-events";
import { detectPlatform, parsePlatform, sendsTo } from "@/lib/platform";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DigistorePayload = Record<string, any>;

/**
 * Digistore envia o `custom` field concatenado com "|":
 *   0: user_id (sck do tracker)
 *   1: utm_source
 *   2: utm_medium
 *   3: utm_campaign
 *   4: utm_content
 *   5: utm_term
 */
function parseCustomField(custom: string | null) {
  if (!custom) {
    return {
      user_id: null,
      utm_source: null, utm_medium: null, utm_campaign: null,
      utm_content: null, utm_term: null,
    };
  }
  const parts = custom.split("|");
  return {
    user_id:      parts[0] || null,
    utm_source:   parts[1] || null,
    utm_medium:   parts[2] || null,
    utm_campaign: parts[3] || null,
    utm_content:  parts[4] || null,
    utm_term:     parts[5] || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);

    const passphrase = await getSetting("DIGISTORE_IPN_PASSPHRASE");
    if (!passphrase) {
      console.error("[webhook/digistore] DIGISTORE_IPN_PASSPHRASE não configurada");
      return NextResponse.json({ error: "config missing" }, { status: 500 });
    }

    if (!verifyDigistoreSignature(params, passphrase)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    // Digistore espera a resposta `OK` em texto puro pra reconhecer o IPN como
    // aceito. Caso contrário reenvia. Vamos responder em JSON pra Next mas
    // acrescentar cabeçalho que Digistore aceita também.
    const event: string = (params.get("event") || "").toLowerCase();
    const transactionId: string | null = params.get("transaction_id") || params.get("order_id");
    const orderId: string | null = params.get("order_id") || transactionId;

    // Ignora pedidos de teste a não ser que DIGISTORE_ACCEPT_TEST=1 (mesma regra
    // do /api/postback/digistore). No IPN o Digistore marca o modo em `api_mode`
    // ("live" | "test"); o postback usa `is_test`. Sem esse filtro, um pedido de
    // teste dispararia Purchase real no Meta/TikTok/GA4.
    const isTest = (params.get("api_mode") || "").toLowerCase() === "test";
    if (isTest && (await getSetting("DIGISTORE_ACCEPT_TEST")) !== "1") {
      return NextResponse.json({ success: true, ignored: "test_payment" });
    }

    const supabase = createAdminClient();

    // ── Events que só atualizam status ──
    if (event === "on_refund" || event === "on_chargeback") {
      if (transactionId) {
        const newStatus = event === "on_chargeback" ? "chargeback" : "refunded";
        await supabase
          .from("purchases")
          .update({ status: newStatus })
          .eq("transaction_id", transactionId);
      }
      return NextResponse.json({ success: true, status_update: event });
    }

    // ── Apenas on_payment e on_rebill disparam Purchase ──
    if (event !== "on_payment" && event !== "on_rebill") {
      return NextResponse.json({ success: true, ignored: event });
    }

    if (!transactionId) {
      return NextResponse.json({ error: "missing transaction_id" }, { status: 400 });
    }

    // ── Extrair dados do payload Digistore ──
    const email: string | null = params.get("email") || params.get("buyer_email") || null;
    const firstName: string | null = params.get("address_first_name") || params.get("first_name") || null;
    const lastName: string | null = params.get("address_last_name") || params.get("last_name") || null;
    const rawPhone: string | null = params.get("address_phone_no") || params.get("phone_no") || null;
    const buyerCountry: string = (params.get("address_country") || params.get("country") || "BR").toString();
    const buyerState: string | null = params.get("address_state") || null;
    const buyerCity: string | null = params.get("address_city") || null;

    // Digistore envia valores em REAIS/DÓLARES/EUROS (NÃO centavos).
    // Defaults de nome no IPN: amount_brutto (gross), amount_netto (líquido pós-taxas),
    // amount_vendor (parte do vendedor), amount_affiliate (afiliado).
    // Aceitamos também `amount` caso o vendor tenha renomeado no painel.
    const valueStr =
      params.get("amount_brutto") ||
      params.get("amount") ||
      params.get("billing_amount_brutto") ||
      "0";
    const value = Number(valueStr) || 0;

    const commissionStr =
      params.get("amount_vendor") ||       // default Digistore
      params.get("amount_netto") ||        // líquido pós-taxas
      params.get("publisher_amount") ||    // alias antigo
      params.get("credit_amount") ||       // alias
      valueStr;                             // fallback pro gross
    const commissionValue = Number(commissionStr) || value;

    const currency: string = (params.get("currency") || "BRL").toUpperCase();

    const productId: string | null = params.get("product_id") || null;
    const productName: string | null = params.get("product_name") || null;

    const customParsed = parseCustomField(params.get("custom"));
    const sck = customParsed.user_id;
    const trackingUtms = {
      utm_source:   customParsed.utm_source,
      utm_medium:   customParsed.utm_medium,
      utm_campaign: customParsed.utm_campaign,
      utm_content:  customParsed.utm_content,
      utm_term:     customParsed.utm_term,
    };

    // ── IDEMPOTÊNCIA ──
    const metaEventId = await sha256("purchase:" + transactionId);
    const { data: existing } = await supabase
      .from("purchases")
      .select("meta_event_id")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (existing?.meta_event_id) {
      console.log(`[webhook/digistore] dedup: transaction_id=${transactionId}`);
      return NextResponse.json({ success: true, deduped: true });
    }

    // ── LEAD MATCHING: sck (user_id) > email ──
    let lead: DigistorePayload | null = null;
    let matchType: "user_id" | "email" | "none" = "none";
    let matchedLead = false;
    if (sck) {
      const { data } = await supabase.from("leads").select("*").eq("user_id", sck).maybeSingle();
      if (data) { lead = data; matchType = "user_id"; matchedLead = true; }
    }
    if (!lead && email) {
      const { data } = await supabase.from("leads").select("*").eq("email", email).maybeSingle();
      if (data) { lead = data; matchType = "email"; matchedLead = true; }
    }
    if (!lead) {
      console.warn(`[webhook/digistore] no lead match for tx=${transactionId} email=${email} sck=${sck}`);
    }

    // ── HASH PII ──
    const emailHash     = email     ? await sha256(email)     : null;
    const phoneE164     = normalizePhone(rawPhone, buyerCountry);
    const phoneHash     = phoneE164 ? await sha256(phoneE164) : null;
    const firstNameHash = firstName ? await sha256(firstName) : null;
    const lastNameHash  = lastName  ? await sha256(lastName)  : null;

    // ── Enriquecer com dados do lead ──
    const leadFbp     = lead?.fbp || null;
    const leadFbc     = lead?.fbc || null;
    const leadIp      = lead?.ip || null;
    const leadUa      = lead?.user_agent || null;
    // Sempre o pixel atual do dash: o token só vale pra ele (lead antigo guarda pixel trocado)
    const leadPixelId = (await getSetting("META_PIXEL_ID"))!;

    const finalUtms = {
      utm_source:   lead?.utm_source   || trackingUtms.utm_source   || null,
      utm_medium:   lead?.utm_medium   || trackingUtms.utm_medium   || null,
      utm_campaign: lead?.utm_campaign || trackingUtms.utm_campaign || null,
      utm_term:     lead?.utm_term     || trackingUtms.utm_term     || null,
      utm_content:  lead?.utm_content  || trackingUtms.utm_content  || null,
    };

    const capiCountry = (lead?.country && lead.country.length <= 3 ? lead.country : null)
      || (buyerCountry.length <= 3 ? buyerCountry.toLowerCase() : null);
    const capiState = (lead?.state && lead.state.length <= 3 ? lead.state : null)
      || (buyerState && buyerState.length <= 3 ? buyerState.toLowerCase() : null);
    const capiCity = lead?.city || buyerCity || null;

    // ── CAPI + GA4 em paralelo ──
    const platform = parsePlatform(lead?.platform) || detectPlatform({ utm_source: finalUtms.utm_source });
    // Compra de uma plataforma não vai pro pixel da outra (ver sendsTo)
    const skipped = () => ({
      response: { error: `skipped: compra de origem ${platform}` },
      sentPayload: {},
    });

    const [capiResult, ga4Result, tiktokResult] = await Promise.all([
      !sendsTo("meta", platform) ? skipped() : sendMetaCAPI({
        eventName: "Purchase",
        eventId: metaEventId,
        pixelId: leadPixelId,
        eventSourceUrl: `https://www.digistore24.com/product/${productId || transactionId}`,
        userData: {
          email,
          phone: phoneE164,
          firstName,
          lastName,
          fbp: leadFbp,
          fbc: leadFbc,
          ip: leadIp,
          userAgent: leadUa,
          externalId: sck || undefined,
          country: capiCountry,
          state: capiState,
          city: capiCity,
        },
        customData: { value, currency },
      }),
      sendGA4Event({
        clientId: sck,
        eventName: "purchase",
        params: {
          engagement_time_msec: 100,
          transaction_id: transactionId,
          value,
          currency,
          source:   finalUtms.utm_source   || undefined,
          medium:   finalUtms.utm_medium   || undefined,
          campaign: finalUtms.utm_campaign || undefined,
          content:  finalUtms.utm_content  || undefined,
          term:     finalUtms.utm_term     || undefined,
          items: productId || productName ? [{
            item_id: productId || undefined,
            item_name: productName || undefined,
            price: value,
            quantity: 1,
          }] : undefined,
        },
      }),
      !sendsTo("tiktok", platform) ? skipped() : sendTikTokEvent({
        eventName: "Purchase",
        eventId: metaEventId,
        userData: {
          email,
          phone: phoneE164,
          externalId: sck || undefined,
          ttclid: lead?.ttclid || null,
          ttp: lead?.ttp || null,
          ip: leadIp,
          userAgent: leadUa,
        },
        properties: {
          value,
          currency,
          order_id: transactionId,
          content_type: "product",
          contents: [{
            content_id: productId || transactionId,
            content_name: productName || undefined,
            price: value,
            quantity: 1,
          }],
        },
      }),
    ]);

    // ── DB: UPSERT purchases ──
    // Transformo params (URLSearchParams) em objeto plain pra salvar em raw_webhook
    const rawPayload: Record<string, string> = {};
    params.forEach((v, k) => { rawPayload[k] = v; });

    const { error: purchaseError } = await supabase.from("purchases").upsert(
      {
        transaction_id: transactionId,
        provider: "digistore",
        user_id: sck,
        email,
        email_hash: emailHash,
        phone_hash: phoneHash,
        first_name_hash: firstNameHash,
        last_name_hash: lastNameHash,
        product_name: productName,
        product_id: productId,
        value,
        commission_value: commissionValue,
        currency,
        status: "approved",
        utm_source:   finalUtms.utm_source,
        utm_medium:   finalUtms.utm_medium,
        utm_campaign: finalUtms.utm_campaign,
        utm_term:     finalUtms.utm_term,
        utm_content:  finalUtms.utm_content,
        fbp: leadFbp,
        fbc: leadFbc,
        country: capiCountry,
        state: capiState,
        city: capiCity,
        matched_lead: matchedLead,
        match_type: matchType,
        meta_event_id: metaEventId,
        response_meta: capiResult.response,
        response_tiktok: tiktokResult.response,
        ttclid: lead?.ttclid || null,
        ttp: lead?.ttp || null,
        platform,
        raw_webhook: { event, order_id: orderId, ...rawPayload },
      },
      { onConflict: "transaction_id" }
    );

    if (purchaseError) {
      console.error("[webhook/digistore] purchases upsert failed:", purchaseError);
    }

    // ── DB: INSERT events_log ──
    const { error: eventInsertError } = await supabase.from("events_log").insert({
      user_id: sck,
      event_name: "Purchase",
      event_id: metaEventId,
      pixel_id: leadPixelId,
      utm_source:   finalUtms.utm_source,
      utm_medium:   finalUtms.utm_medium,
      utm_campaign: finalUtms.utm_campaign,
      utm_term:     finalUtms.utm_term,
      utm_content:  finalUtms.utm_content,
      payload_meta: capiResult.sentPayload,
      response_meta: capiResult.response,
      response_ga4: ga4Result,
      payload_tiktok: tiktokResult.sentPayload,
      response_tiktok: tiktokResult.response,
      platform,
      ip: leadIp,
      country: capiCountry,
      state: capiState,
      city: capiCity,
    });

    if (eventInsertError) {
      console.error("[webhook/digistore] events_log insert failed:", eventInsertError);
    }

    if (matchedLead && lead && email && !lead.email) {
      await supabase
        .from("leads")
        .update({ email, email_hash: emailHash })
        .eq("user_id", lead.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[webhook/digistore]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
