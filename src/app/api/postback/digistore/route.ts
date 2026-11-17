import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase";
import { sha256 } from "@/lib/hash";
import { sendMetaCAPI } from "@/lib/meta-capi";
import { sendGA4Event } from "@/lib/ga4-mp";
import { getSetting } from "@/lib/settings";
import { sendTikTokEvent } from "@/lib/tiktok-events";
import { detectPlatform, parsePlatform, sendsTo } from "@/lib/platform";

/**
 * Digistore24 S2S Postback
 *
 * Recebe GET com query params conforme placeholders configurados no painel
 * Digistore. Autenticação via `secret` no URL, comparado com
 * DIGISTORE_POSTBACK_SECRET em constant-time.
 *
 * Independente do IPN passphrase da conta — cada postback tem seu segredo
 * próprio, então não conflita com outras integrações.
 *
 * Placeholders esperados (configurar no Digistore):
 *   secret         = <DIGISTORE_POSTBACK_SECRET>
 *   event          = {transaction_type}  (payment | refund | chargeback | ...)
 *   transaction_id = {transaction_id}
 *   order_id       = {order_id}
 *   product_id     = {product_id}
 *   product_name   = {product_name}
 *   amount_brutto  = {amount_brutto}
 *   amount_vendor  = {amount_vendor}
 *   currency       = {currency}
 *   email          = {email}
 *   first_name     = {first_name}
 *   last_name      = {last_name}
 *   country        = {country}
 *   cid            = {cid}         (= user_id do tracker)
 *   utm_source     = {utm_source}
 *   utm_medium     = {utm_medium}
 *   utm_campaign   = {utm_campaign}
 *   utm_content    = {utm_content}
 *   utm_term       = {utm_term}
 *   is_test        = {is_test}
 *   random         = {random}      (cache buster)
 */

function verifySecret(received: string | null, expected: string | undefined): boolean {
  if (!received) return false;
  if (!expected) return false;
  if (received.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

// Mapa Digistore transaction_type → nosso status canônico
function mapEventToStatus(event: string): "approved" | "refunded" | "chargeback" | "ignore" {
  const e = (event || "").toLowerCase();
  if (e === "payment") return "approved";
  if (e === "refund") return "refunded";
  if (e === "chargeback") return "chargeback";
  // rebill_cancelled, rebill_resumed, payment_missed, payment_denial, last_paid_day → ignora
  return "ignore";
}

export async function GET(request: NextRequest) {
  return handle(request);
}
// POST também suportado caso o vendor configure assim
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    if (!verifySecret(sp.get("secret"), await getSetting("DIGISTORE_POSTBACK_SECRET"))) {
      return NextResponse.json({ error: "invalid secret" }, { status: 401 });
    }

    const rawEvent = sp.get("event") || "";
    const status = mapEventToStatus(rawEvent);

    const transactionId = sp.get("transaction_id") || sp.get("order_id") || null;
    if (!transactionId) {
      return NextResponse.json({ error: "missing transaction_id" }, { status: 400 });
    }

    // Ignora test payments a não ser que DIGISTORE_ACCEPT_TEST=1
    const isTest = sp.get("is_test") === "1";
    if (isTest && (await getSetting("DIGISTORE_ACCEPT_TEST")) !== "1") {
      return NextResponse.json({ success: true, ignored: "test_payment" });
    }

    const supabase = createAdminClient();

    // ── Events que só atualizam status ──
    if (status === "refunded" || status === "chargeback") {
      await supabase
        .from("purchases")
        .update({ status })
        .eq("transaction_id", transactionId);
      return NextResponse.json({ success: true, status_update: status });
    }

    if (status === "ignore") {
      return NextResponse.json({ success: true, ignored: rawEvent });
    }

    // status === "approved" — processa Purchase completo
    const email = sp.get("email") || null;
    const firstName = sp.get("first_name") || null;
    const lastName = sp.get("last_name") || null;
    const rawCountry = sp.get("country") || "BR";

    const valueStr =
      sp.get("amount_brutto") ||
      sp.get("amount_brutto_abs") ||
      sp.get("amount") ||
      "0";
    const value = Number(valueStr) || 0;

    const commissionStr =
      sp.get("amount_vendor") ||
      sp.get("amount_vendor_abs") ||
      sp.get("amount_netto") ||
      valueStr;
    const commissionValue = Number(commissionStr) || value;

    const currency = (sp.get("currency") || "BRL").toUpperCase();

    const productId = sp.get("product_id") || null;
    const productName = sp.get("product_name") || null;

    const sck = sp.get("cid") || null;
    const trackingUtms = {
      utm_source:   sp.get("utm_source")   || null,
      utm_medium:   sp.get("utm_medium")   || null,
      utm_campaign: sp.get("utm_campaign") || null,
      utm_content:  sp.get("utm_content")  || null,
      utm_term:     sp.get("utm_term")     || null,
    };

    // ── IDEMPOTÊNCIA ──
    const metaEventId = await sha256("purchase:" + transactionId);
    const { data: existing } = await supabase
      .from("purchases")
      .select("meta_event_id")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (existing?.meta_event_id) {
      return NextResponse.json({ success: true, deduped: true });
    }

    // ── LEAD MATCHING: cid (user_id) > email ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lead: any = null;
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

    // ── HASH PII ──
    const emailHash     = email     ? await sha256(email)     : null;
    // Postback não traz phone. Se lead tem phone_hash já salvo, reaproveita.
    const phoneHash     = lead?.phone_hash || null;
    const firstNameHash = firstName ? await sha256(firstName) : null;
    const lastNameHash  = lastName  ? await sha256(lastName)  : null;

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
      || (rawCountry.length <= 3 ? rawCountry.toLowerCase() : null);
    const capiState = lead?.state || null;
    const capiCity  = lead?.city  || null;

    // Phone do lead (se houver) — postback não traz phone raw, mas podemos
    // re-enviar o hash já salvo pro CAPI. sendMetaCAPI hasheia o phone passado,
    // então precisamos enviar um valor já "pronto". Como sendMetaCAPI sempre
    // hasheia, passamos o phone normalizado do lead se disponível (não o hash).
    const leadPhoneE164 = lead?.phone_e164 || null;

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
          phone: leadPhoneE164,
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
          phone: leadPhoneE164,
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

    // Monta rawPayload com todos os query params (pra auditoria em raw_webhook)
    const rawPayload: Record<string, string> = {};
    sp.forEach((v, k) => {
      if (k === "secret") return; // nunca logar segredo
      rawPayload[k] = v;
    });

    // ── DB: UPSERT purchases ──
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
        raw_webhook: { source: "s2s_postback", event: rawEvent, ...rawPayload },
      },
      { onConflict: "transaction_id" }
    );

    if (purchaseError) {
      console.error("[postback/digistore] purchases upsert failed:", purchaseError);
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
      console.error("[postback/digistore] events_log insert failed:", eventInsertError);
    }

    if (matchedLead && lead && email && !lead.email) {
      await supabase
        .from("leads")
        .update({ email, email_hash: emailHash })
        .eq("user_id", lead.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[postback/digistore]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
