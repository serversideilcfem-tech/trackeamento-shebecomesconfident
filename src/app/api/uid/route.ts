import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { cookieDomainFor, parseDomains } from "@/lib/domains";

const COOKIE_NAME = "_rm_uid";
const MAX_AGE = 60 * 60 * 24 * 400; // 400 dias (cap atual dos browsers)

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function corsHeaders(origin: string | null) {
  // credentials:include exige Origin reflect, não pode ser "*"
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  // Permite "sticky recovery": cliente envia ?uid=... do localStorage para re-setar o cookie
  const recoverUid = request.nextUrl.searchParams.get("uid");

  const uid = existing || (recoverUid && /^[0-9a-f-]{36}$/i.test(recoverUid) ? recoverUid : null) || uuid4();

  const res = NextResponse.json(
    { user_id: uid },
    { headers: corsHeaders(origin) }
  );

  // Meta e TikTok podem usar domínios diferentes: vale o que contém o host.
  // Header, não nextUrl: no Next 14 o nextUrl não garante o Host público.
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0].split(":")[0].trim();
  const domains = parseDomains(
    await getSetting("COOKIE_DOMAIN"),
    await getSetting("COOKIE_DOMAIN_TIKTOK")
  );

  // Server-set cookie via Set-Cookie header → não sofre cap de 7 dias do ITP do Safari
  res.cookies.set(COOKIE_NAME, uid, {
    httpOnly: false, // pulse.js precisa ler
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: cookieDomainFor(host, domains),
    maxAge: MAX_AGE,
  });

  return res;
}
