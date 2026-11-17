// Google Analytics 4 Measurement Protocol
// Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
//
// Não envia PII hasheada (GA4 MP não suporta hashing do mesmo jeito que Meta CAPI).
// Envia apenas client_id (_rm_uid), transaction_id, value, currency, items e UTMs.

import { getSetting } from "./settings";

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export type GA4EventName = "page_view" | "begin_checkout" | "purchase";

const META_TO_GA4: Record<string, GA4EventName> = {
  PageView: "page_view",
  InitiateCheckout: "begin_checkout",
  Purchase: "purchase",
};

export function mapMetaToGA4(metaEventName: string): GA4EventName | null {
  return META_TO_GA4[metaEventName] ?? null;
}

export interface GA4Result {
  ok: boolean;
  status?: number;
  skipped?: boolean;
  error?: string;
}

export interface SendGA4Params {
  clientId: string | null | undefined;
  userId?: string | null;
  eventName: GA4EventName;
  params?: Record<string, unknown>;
  userProperties?: Record<string, { value: unknown }>;
}

export async function sendGA4Event(input: SendGA4Params): Promise<GA4Result> {
  const measurementId = await getSetting("GA4_MEASUREMENT_ID");
  const apiSecret = await getSetting("GA4_API_SECRET");
  if (!measurementId || !apiSecret) {
    return { ok: false, skipped: true, error: "missing GA4_MEASUREMENT_ID or GA4_API_SECRET" };
  }
  if (!input.clientId) {
    return { ok: false, skipped: true, error: "missing client_id" };
  }

  const url = `${GA4_ENDPOINT}?measurement_id=${measurementId}&api_secret=${apiSecret}`;
  const payload: Record<string, unknown> = {
    client_id: input.clientId,
    events: [{
      name: input.eventName,
      params: input.params ?? {},
    }],
  };
  if (input.userId) payload.user_id = input.userId;
  if (input.userProperties) payload.user_properties = input.userProperties;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[ga4-mp]", err);
    return { ok: false, error: String(err) };
  }
}
