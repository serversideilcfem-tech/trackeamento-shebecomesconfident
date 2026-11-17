import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { parseDomains, parsePixelUrls } from "@/lib/domains";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

/**
 * GET /api/config — config pública do pulse.js (IDs editados no dash).
 * Só IDs que já são públicos no browser; NUNCA tokens/segredos aqui.
 */
export async function GET() {
  const [metaPixelId, tiktokPixelId, ga4Id, ignoredMeta, ignoredTiktok, metaDomains, tiktokDomains] = await Promise.all([
    getSetting("META_PIXEL_ID"),
    getSetting("TIKTOK_PIXEL_ID"),
    getSetting("GA4_MEASUREMENT_ID"),
    getSetting("IGNORED_REFERRER_DOMAINS"),
    getSetting("IGNORED_REFERRER_DOMAINS_TIKTOK"),
    getSetting("META_PIXEL_DOMAINS"),
    getSetting("TIKTOK_PIXEL_DOMAINS"),
  ]);

  return NextResponse.json(
    {
      meta_pixel_id: metaPixelId || null,
      tiktok_pixel_id: tiktokPixelId || null,
      ga4_id: ga4Id || null,
      // Cloakers do Meta + TikTok: referrer de qualquer um não é origem
      ignored_referrers: parseDomains(ignoredMeta, ignoredTiktok),
      // URLs (domínio + slug) onde cada pixel dispara ([] = todas)
      meta_urls: parsePixelUrls(metaDomains),
      tiktok_urls: parsePixelUrls(tiktokDomains),
    },
    { headers: HEADERS }
  );
}
