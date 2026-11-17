import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRealIp } from "@/lib/get-ip";
import { geoLookup } from "@/lib/geo";
import { sendMetaCAPI } from "@/lib/meta-capi";
import { sendGA4Event, mapMetaToGA4 } from "@/lib/ga4-mp";
import { getSetting } from "@/lib/settings";
import { sendTikTokEvent } from "@/lib/tiktok-events";
import { detectPlatform, cleanClickId } from "@/lib/platform";
import { parsePixelUrls, urlAllowed } from "@/lib/domains";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event_name, event_id, user_id, pixel_id,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbp, fbc, user_agent, page_url, page_referrer,
      ga4_session_id,
    } = body;
    const ttclid = cleanClickId(body.ttclid);
    const ttp = cleanClickId(body.ttp);
    const fbclid = cleanClickId(body.fbclid);

    if (!event_name || !event_id) {
      return NextResponse.json({ error: "Missing event_name or event_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const ip = getRealIp(request);
    const geo = await geoLookup(ip);

    // Enriquecer com dados do lead (aumenta EMQ)
    let leadEmail: string | null = null;
    let leadFbp = fbp;
    let leadFbc = fbc;
    let leadCountry = geo.countryCode;
    let leadState = geo.stateCode;
    let leadCity = geo.city;
    let leadTtclid = ttclid;
    let leadTtp = ttp;
    let leadPlatform: string | null = null;

    if (user_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user_id)
        .single();

      if (lead) {
        leadEmail = lead.email || null;
        leadFbp = fbp || lead.fbp;
        leadFbc = fbc || lead.fbc;
        leadCountry = geo.countryCode || lead.country;
        leadState = geo.stateCode || lead.state;
        leadCity = geo.city || lead.city;
        leadTtclid = ttclid || lead.ttclid;
        leadTtp = ttp || lead.ttp;
        leadPlatform = lead.platform || null;
      }
    }

    const pixelToUse = pixel_id || (await getSetting("META_PIXEL_ID"))!;

    const platform = detectPlatform({ ttclid, fbclid, utm_source }) || leadPlatform;

    // URL (domínio + slug) de disparo por pixel (dash). Mesma regra do pulse.js.
    let pageHost = "";
    let pagePath = "";
    try { ({ hostname: pageHost, pathname: pagePath } = new URL(page_url)); } catch {}
    const [metaDomains, tiktokDomains] = await Promise.all([
      getSetting("META_PIXEL_DOMAINS"),
      getSetting("TIKTOK_PIXEL_DOMAINS"),
    ]);
    const skipped = (list: string) => ({
      response: { error: `skipped: ${pageHost ? pageHost + pagePath : "page_url vazio"} fora de ${list}` },
      sentPayload: {},
    });

    // Meta CAPI + GA4 MP + TikTok em paralelo
    const ga4Name = mapMetaToGA4(event_name);
    const [capiResult, ga4Result, tiktokResult] = await Promise.all([
      !urlAllowed(pageHost, pagePath, parsePixelUrls(metaDomains)) ? skipped("META_PIXEL_DOMAINS") : sendMetaCAPI({
        eventName: event_name,
        eventId: event_id,
        pixelId: pixelToUse,
        eventSourceUrl: page_url,
        userData: {
          email: leadEmail,
          fbp: leadFbp,
          fbc: leadFbc,
          ip,
          userAgent: user_agent,
          externalId: user_id,
          country: leadCountry,
          state: leadState,
          city: leadCity,
        },
      }),
      ga4Name
        ? sendGA4Event({
            clientId: user_id,
            eventName: ga4Name,
            params: {
              // session_id + engagement_time_msec: obrigatórios para GA4 contar
              // como sessão/engajamento. Sem eles, eventos chegam mas não formam
              // sessão. session_id vem do cookie _ga_<container> setado pelo gtag
              // client-side (fonte de verdade para sessões).
              session_id: ga4_session_id || undefined,
              engagement_time_msec: 100,
              page_location: page_url,
              page_referrer: page_referrer || undefined,
              source: utm_source || undefined,
              medium: utm_medium || undefined,
              campaign: utm_campaign || undefined,
              content: utm_content || undefined,
              term: utm_term || undefined,
            },
          })
        : Promise.resolve({ ok: false, skipped: true, error: `no GA4 mapping for ${event_name}` }),
      !urlAllowed(pageHost, pagePath, parsePixelUrls(tiktokDomains)) ? skipped("TIKTOK_PIXEL_DOMAINS") : sendTikTokEvent({
        eventName: event_name,
        eventId: event_id,
        pageUrl: page_url,
        pageReferrer: page_referrer,
        userData: {
          email: leadEmail,
          externalId: user_id,
          ttclid: leadTtclid,
          ttp: leadTtp,
          ip,
          userAgent: user_agent,
        },
      }),
    ]);

    // Log no banco
    const { error: insertError } = await supabase.from("events_log").insert({
      user_id,
      event_name,
      event_id,
      pixel_id: pixelToUse,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      payload_meta: capiResult.sentPayload,
      response_meta: capiResult.response,
      response_ga4: ga4Result,
      payload_tiktok: tiktokResult.sentPayload,
      response_tiktok: tiktokResult.response,
      platform,
      ip,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      referrer: page_referrer || null,
    });

    if (insertError) {
      console.error("[api/event] insert failed:", insertError);
      return NextResponse.json(
        { error: "DB insert failed", details: insertError.message },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    return NextResponse.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("[api/event]", err);
    return NextResponse.json({ error: "Internal error" }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
