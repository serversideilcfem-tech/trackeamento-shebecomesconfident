import { sha256 } from "./hash";
import { getSetting } from "./settings";

// Meta CAPI exige city sem acentos, lowercase, antes de hashear
function normalizeCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export interface CAPIUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  externalId?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface CAPIEvent {
  eventName: string;
  eventId: string;
  eventTime?: number;
  pixelId: string;
  userData: CAPIUserData;
  customData?: Record<string, unknown>;
  eventSourceUrl?: string;
}

export interface CAPIResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: unknown;
}

export interface CAPIResult {
  response: CAPIResponse;
  sentPayload: Record<string, unknown>;
}

export async function sendMetaCAPI(event: CAPIEvent): Promise<CAPIResult> {
  const { eventName, eventId, eventTime, pixelId, userData, customData, eventSourceUrl } = event;

  // Config ausente degrada em resultado com erro (mesmo shape do skip do GA4),
  // em vez de mandar "Bearer undefined" / postar em /v19.0/undefined/events
  const accessToken = await getSetting("META_ACCESS_TOKEN");
  if (!pixelId || !accessToken) {
    return {
      response: { error: "missing META_PIXEL_ID or META_ACCESS_TOKEN (configure em /dashboard/configuracoes)" },
      sentPayload: {},
    };
  }

  const hashedUser: Record<string, unknown> = {};

  // ── Campos PII — SHA-256 hashed ──
  if (userData.email)      hashedUser.em = await sha256(userData.email);
  if (userData.phone)      hashedUser.ph = await sha256(userData.phone.replace(/\D/g, ""));
  if (userData.firstName)  hashedUser.fn = await sha256(userData.firstName);
  if (userData.lastName)   hashedUser.ln = await sha256(userData.lastName);

  // ── Geo — SHA-256 hashed ──
  if (userData.country)    hashedUser.country = await sha256(userData.country);
  if (userData.state)      hashedUser.st = await sha256(userData.state);
  if (userData.city)       hashedUser.ct = await sha256(normalizeCity(userData.city));

  // ── External ID — SHA-256 hashed ──
  if (userData.externalId) hashedUser.external_id = await sha256(userData.externalId);

  // ── Browser identifiers — NÃO hashear ──
  if (userData.fbp) hashedUser.fbp = userData.fbp;
  if (userData.fbc) hashedUser.fbc = userData.fbc;

  // ── Network data — plain text ──
  if (userData.ip)        hashedUser.client_ip_address = userData.ip;
  if (userData.userAgent) hashedUser.client_user_agent = userData.userAgent;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: eventName,
      event_id: eventId,
      event_time: eventTime ?? Math.floor(Date.now() / 1000),
      event_source_url: eventSourceUrl,
      action_source: "website",
      user_data: hashedUser,
      custom_data: customData,
    }],
  };

  const testEventCode = await getSetting("META_TEST_EVENT_CODE");
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const response = await res.json();
    return { response, sentPayload: payload };
  } catch (err) {
    return { response: { error: String(err) }, sentPayload: payload };
  }
}
