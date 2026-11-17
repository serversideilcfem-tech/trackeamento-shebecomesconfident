import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRealIp } from "@/lib/get-ip";
import { geoLookup } from "@/lib/geo";
import { getSetting } from "@/lib/settings";
import { detectPlatform, cleanClickId } from "@/lib/platform";

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
      user_id, pixel_id, user_agent,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbp, fbc, page_referrer,
    } = body;
    const ttclid = cleanClickId(body.ttclid);
    const ttp = cleanClickId(body.ttp);
    const fbclid = cleanClickId(body.fbclid);

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const ip = getRealIp(request);
    const geo = await geoLookup(ip);
    const platform = detectPlatform({ ttclid, fbclid, utm_source });

    const { error: upsertError } = await supabase.from("leads").upsert(
      {
        user_id,
        pixel_id: pixel_id || (await getSetting("META_PIXEL_ID")),
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        fbp,
        fbc,
        ip,
        user_agent,
        country: geo.countryCode,
        state: geo.stateCode,
        city: geo.city,
        referrer: page_referrer || null,
        // Só sobrescreve quando há valor: visita sem click id não apaga o anterior
        ...(ttclid ? { ttclid } : {}),
        ...(ttp ? { ttp } : {}),
        ...(platform ? { platform } : {}),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("[api/lead] upsert failed:", upsertError);
      return NextResponse.json(
        { error: "DB upsert failed", details: upsertError.message },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    return NextResponse.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("[api/lead]", err);
    return NextResponse.json({ error: "Internal error" }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
