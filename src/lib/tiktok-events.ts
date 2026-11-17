import { sha256 } from "./hash";
import { getSetting } from "./settings";

// TikTok Events API 2.0 (web). Mesmo shape de retorno do sendMetaCAPI pra
// logar em events_log/purchases do mesmo jeito.
// Ref: https://business-api.tiktok.com/portal/docs?id=1771101303285761

export interface TikTokUserData {
  email?: string | null;
  phone?: string | null; // E.164 sem "+" (saída de normalizePhone)
  externalId?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface TikTokEvent {
  eventName: string;
  eventId: string;
  eventTime?: number;
  userData: TikTokUserData;
  properties?: Record<string, unknown>;
  pageUrl?: string | null;
  pageReferrer?: string | null;
}

export interface TikTokResult {
  response: { code?: number; message?: string; request_id?: string; error?: unknown };
  sentPayload: Record<string, unknown>;
}

// Nomes do nosso pipeline (padrão Meta) → eventos padrão TikTok.
// PageView vira ViewContent: page view server-side não existe como evento
// padrão; o pixel client manda ttq.page() + ViewContent com o mesmo event_id.
const EVENT_MAP: Record<string, string> = {
  PageView: "ViewContent",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "Purchase",
  Lead: "Lead",
};

export function mapToTikTok(eventName: string): string | null {
  return EVENT_MAP[eventName] ?? null;
}

export async function sendTikTokEvent(event: TikTokEvent): Promise<TikTokResult> {
  const [pixelId, accessToken, testEventCode] = await Promise.all([
    getSetting("TIKTOK_PIXEL_ID"),
    getSetting("TIKTOK_ACCESS_TOKEN"),
    getSetting("TIKTOK_TEST_EVENT_CODE"),
  ]);
  // TikTok é opcional: sem config, registra skip em vez de chamar a API
  if (!pixelId || !accessToken) {
    return { response: { error: "tiktok not configured" }, sentPayload: {} };
  }

  const ttEvent = mapToTikTok(event.eventName);
  if (!ttEvent) {
    return { response: { error: `no TikTok mapping for ${event.eventName}` }, sentPayload: {} };
  }

  const { userData: u } = event;
  const user: Record<string, unknown> = {};
  if (u.email)      user.email = await sha256(u.email);
  if (u.phone)      user.phone = await sha256("+" + u.phone.replace(/\D/g, ""));
  if (u.externalId) user.external_id = await sha256(u.externalId);
  if (u.ttclid)     user.ttclid = u.ttclid;
  if (u.ttp)        user.ttp = u.ttp;
  if (u.ip)         user.ip = u.ip;
  if (u.userAgent)  user.user_agent = u.userAgent;

  const page: Record<string, unknown> = {};
  if (event.pageUrl)      page.url = event.pageUrl;
  if (event.pageReferrer) page.referrer = event.pageReferrer;

  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: pixelId,
    data: [{
      event: ttEvent,
      event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      user,
      page,
      properties: event.properties,
    }],
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": accessToken },
      body: JSON.stringify(payload),
    });
    return { response: await res.json(), sentPayload: payload };
  } catch (err) {
    return { response: { error: String(err) }, sentPayload: payload };
  }
}
