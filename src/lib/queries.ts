import { metaStatus, ga4Status, tiktokStatus, sendRate } from "@/lib/send-status";
import { SupabaseClient } from "@supabase/supabase-js";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { TIMEZONE, formatDateSP } from "./utils";
import type { Platform } from "./platform";

// Filtro Meta/TikTok do dashboard. Sem platform = "Tudo".
// (cast: constraint genérico com os tipos do supabase-js estoura TS2589)
function byPlatform<Q>(q: Q, platform?: Platform): Q {
  if (!platform) return q;
  return (q as unknown as { eq(column: string, value: string): Q }).eq("platform", platform);
}

// Supabase corta em 1000 linhas sem .range(). Essa função pagina até esgotar.
// Usar em qualquer query de events_log que alimente counts/aggregations.
async function fetchAllEventsLog<T>(
  supabase: SupabaseClient,
  from: string,
  to: string,
  columns: string,
  platform?: Platform
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await byPlatform(
      supabase.from("events_log").select(columns).gte("created_at", from).lte("created_at", to),
      platform
    ).range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export function getDateRange(searchParams: { from?: string; to?: string }): {
  from: string; to: string;
} {
  const now = toZonedTime(new Date(), TIMEZONE);
  const defaultFrom = startOfDay(subDays(now, 6));
  const defaultTo = endOfDay(now);

  let start = defaultFrom;
  let end = defaultTo;

  if (searchParams.from) {
    start = startOfDay(new Date(searchParams.from + "T00:00:00"));
  }
  if (searchParams.to) {
    end = endOfDay(new Date(searchParams.to + "T00:00:00"));
  }

  const fromUtc = fromZonedTime(start, TIMEZONE);
  const toUtc = fromZonedTime(end, TIMEZONE);

  return {
    from: fromUtc.toISOString(),
    to: toUtc.toISOString(),
  };
}

export async function getOverviewMetrics(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  type EventRow = { event_name: string | null; user_id: string | null };
  const [purchasesRes, events] = await Promise.all([
    byPlatform(
      supabase
        .from("purchases")
        .select("value, commission_value, currency, status, user_id, matched_lead")
        .gte("created_at", from)
        .lte("created_at", to),
      platform
    ).in("status", ["approved", "complete"]),
    fetchAllEventsLog<EventRow>(supabase, from, to, "event_name, user_id", platform),
  ]);

  const purchases = purchasesRes.data || [];

  const revenueBruto = purchases.reduce((sum, p) => sum + Number(p.value), 0);
  const revenueLiquido = purchases.reduce((sum, p) => sum + Number(p.commission_value ?? p.value), 0);
  const purchaseCount = purchases.length;
  const uniqueUsers = new Set(events.filter(e => e.user_id).map(e => e.user_id)).size;
  const pageViews = events.filter(e => e.event_name === "PageView").length;
  const checkouts = events.filter(e => e.event_name === "InitiateCheckout").length;

  const matchedCount = purchases.filter(p => p.matched_lead).length;
  const matchRate = purchases.length > 0 ? (matchedCount / purchases.length) * 100 : 0;
  const convRate = pageViews > 0 ? (purchaseCount / pageViews) * 100 : 0;

  // Moeda dominante das compras (maior contagem). Fallback BRL se nenhum.
  const currency = dominantCurrency(purchases);

  return {
    revenueBruto,
    revenueLiquido,
    currency,
    purchaseCount,
    uniqueUsers,
    pageViews,
    checkouts,
    matchRate,
    convRate,
  };
}

// Helper: retorna a moeda mais comum num array de purchases; fallback BRL
function dominantCurrency(purchases: Array<{ currency?: string | null }>): string {
  if (!purchases.length) return "BRL";
  const counts: Record<string, number> = {};
  for (const p of purchases) {
    const c = (p.currency || "BRL").toUpperCase();
    counts[c] = (counts[c] || 0) + 1;
  }
  let max = 0, best = "BRL";
  for (const [c, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = c; }
  }
  return best;
}

export async function getRevenueByDay(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  const { data } = await byPlatform(
    supabase
      .from("purchases")
      .select("value, commission_value, currency, created_at")
      .gte("created_at", from)
      .lte("created_at", to),
    platform
  ).in("status", ["approved", "complete"]);

  const purchases = data || [];

  const brutoByDay: Record<string, number> = {};
  const liquidoByDay: Record<string, number> = {};
  for (const p of purchases) {
    const day = formatDateSP(p.created_at, "yyyy-MM-dd");
    brutoByDay[day] = (brutoByDay[day] || 0) + Number(p.value);
    liquidoByDay[day] = (liquidoByDay[day] || 0) + Number(p.commission_value ?? p.value);
  }

  const currency = dominantCurrency(purchases);

  // Itera datas de calendário do TIMEZONE (não UTC), pra bater com as chaves acima
  const endKey = formatDateSP(to, "yyyy-MM-dd");
  const days: { date: string; faturamento: number; faturamento_liquido: number }[] = [];
  for (let d = new Date(formatDateSP(from, "yyyy-MM-dd") + "T00:00:00Z"); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    if (key > endKey) break;
    days.push({
      date: key,
      faturamento: Math.round((brutoByDay[key] || 0) * 100) / 100,
      faturamento_liquido: Math.round((liquidoByDay[key] || 0) * 100) / 100,
    });
  }

  return { days, currency };
}

export async function getFunnelData(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  type EventRow = { event_name: string | null };
  const all = await fetchAllEventsLog<EventRow>(supabase, from, to, "event_name", platform);
  const pageViews = all.filter(e => e.event_name === "PageView").length;
  const checkouts = all.filter(e => e.event_name === "InitiateCheckout").length;
  const purchases = all.filter(e => e.event_name === "Purchase").length;

  return [
    { stage: "PageView", count: pageViews, rate: 100 },
    { stage: "Checkout", count: checkouts, rate: pageViews > 0 ? (checkouts / pageViews) * 100 : 0 },
    { stage: "Purchase", count: purchases, rate: checkouts > 0 ? (purchases / checkouts) * 100 : 0 },
  ];
}

export async function getEventStats(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  type EventRow = {
    event_name: string | null;
    user_id: string | null;
    response_meta: Record<string, unknown> | null;
    response_ga4: Record<string, unknown> | null;
    response_tiktok: Record<string, unknown> | null;
  };
  const all = await fetchAllEventsLog<EventRow>(
    supabase, from, to,
    "event_name, user_id, response_meta, response_ga4, response_tiktok",
    platform
  );

  const pageViews = all.filter(e => e.event_name === "PageView").length;
  const checkouts = all.filter(e => e.event_name === "InitiateCheckout").length;
  const purchases = all.filter(e => e.event_name === "Purchase").length;
  const uniqueUsers = new Set(all.filter(e => e.user_id).map(e => e.user_id)).size;

  // Taxas só entre eventos que deveriam ir pra plataforma: skip (página fora
  // da lista do pixel, compra de outra plataforma, não configurado) não conta.
  const capiRate = sendRate(all.map(e => metaStatus(e.response_meta)));
  const ga4Rate = sendRate(all.map(e => ga4Status(e.response_ga4)));
  const tiktokRate = sendRate(all.map(e => tiktokStatus(e.response_tiktok)));

  const eventNames = Array.from(
    new Set(all.map(e => e.event_name).filter(Boolean) as string[])
  ).sort();

  return { pageViews, checkouts, purchases, uniqueUsers, capiRate, ga4Rate, tiktokRate, eventNames };
}

export async function getEventsLog(
  supabase: SupabaseClient,
  from: string,
  to: string,
  limit = 200,
  eventName?: string,
  platform?: Platform
) {
  if (!eventName) {
    const { data } = await byPlatform(
      supabase.from("events_log").select("*").gte("created_at", from).lte("created_at", to),
      platform
    )
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  }

  // Filtrado por event_name: pagina pra cobrir o range inteiro (sem o cap
  // de 1000 do Supabase). Necessário pra ver TODAS as compras do período
  // no /dashboard/eventos quando o usuário filtra por "Purchase".
  const PAGE_SIZE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await byPlatform(
      supabase.from("events_log").select("*").gte("created_at", from).lte("created_at", to),
      platform
    )
      .eq("event_name", eventName)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function getOperationMetrics(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  const { data } = await byPlatform(
    supabase
      .from("purchases")
      .select("value, commission_value, currency, status, matched_lead")
      .gte("created_at", from)
      .lte("created_at", to),
    platform
  );

  const all = data || [];
  const approvedStatuses = new Set(["approved", "complete"]);
  const refundedStatuses = new Set(["refunded", "chargeback"]);

  const sales = all.filter(p => approvedStatuses.has(p.status) || refundedStatuses.has(p.status));
  const approved = all.filter(p => approvedStatuses.has(p.status));
  const refunded = all.filter(p => refundedStatuses.has(p.status));

  const revenueBruto = approved.reduce((s, p) => s + Number(p.value), 0);
  const revenueLiquido = approved.reduce((s, p) => s + Number(p.commission_value ?? p.value), 0);
  const refundedValue = refunded.reduce((s, p) => s + Number(p.commission_value ?? p.value), 0);

  const matchedCount = all.filter(p => p.matched_lead).length;
  const matchRate = all.length > 0 ? (matchedCount / all.length) * 100 : 0;
  const refundRate = sales.length > 0 ? (refunded.length / sales.length) * 100 : 0;

  const currency = dominantCurrency(approved.length ? approved : all);

  return {
    revenueBruto,
    revenueLiquido,
    refundedValue,
    refundedCount: refunded.length,
    approvedCount: approved.length,
    matchRate,
    refundRate,
    totalCount: sales.length,
    currency,
  };
}

export async function getPurchases(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  const { data } = await byPlatform(
    supabase.from("purchases").select("*").gte("created_at", from).lte("created_at", to),
    platform
  ).order("created_at", { ascending: false });

  return data || [];
}

export async function getUserHistory(supabase: SupabaseClient, userId: string) {
  const [eventsRes, leadsRes, purchasesRes] = await Promise.all([
    supabase
      .from("events_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("purchases")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    events: eventsRes.data || [],
    lead: leadsRes.data || null,
    purchases: purchasesRes.data || [],
  };
}

export async function searchUsers(supabase: SupabaseClient, query: string, field: "user_id" | "email" | "ip") {
  if (field === "email") {
    const { data } = await supabase
      .from("leads")
      .select("user_id, email, ip, created_at")
      .ilike("email", `%${query}%`)
      .limit(20);
    return data || [];
  }
  if (field === "ip") {
    const { data } = await supabase
      .from("events_log")
      .select("user_id, ip, created_at")
      .eq("ip", query)
      .limit(20);
    const results = data || [];
    const unique = new Map<string, (typeof results)[number]>();
    for (const e of results) {
      if (e.user_id && !unique.has(e.user_id)) unique.set(e.user_id, e);
    }
    return Array.from(unique.values());
  }
  const { data } = await supabase
    .from("leads")
    .select("user_id, email, ip, created_at")
    .ilike("user_id", `%${query}%`)
    .limit(20);
  return data || [];
}

// ─── Campaign Attribution (UTM-only, sem Meta Ads) ────────────────────────────

type UtmNode = {
  pageViews: number;
  checkouts: number;
  purchases: number;
  revenueBruto: number;
  revenueLiquido: number;
};

function newNode(): UtmNode {
  return { pageViews: 0, checkouts: 0, purchases: 0, revenueBruto: 0, revenueLiquido: 0 };
}

export type UtmSourceGroup = UtmNode & {
  campaigns: Record<string, UtmNode & {
    mediums: Record<string, UtmNode & {
      contents: Record<string, UtmNode>;
    }>;
  }>;
};

export async function getCampaignAttribution(supabase: SupabaseClient, from: string, to: string, platform?: Platform) {
  type EventRow = {
    event_name: string | null;
    user_id: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    referrer: string | null;
    payload_meta: Record<string, unknown> | null;
  };
  const [purchasesRes, events, leadsRes] = await Promise.all([
    // NOTA: `referrer` NÃO existe em purchases (só em events_log e leads).
    // Não adicionar referrer aqui sob risco de error 42703 → query vazia silenciosa.
    byPlatform(
      supabase
        .from("purchases")
        .select("user_id, email, value, commission_value, currency, utm_source, utm_medium, utm_campaign, utm_content")
        .gte("created_at", from)
        .lte("created_at", to),
      platform
    ).in("status", ["approved", "complete"]),
    fetchAllEventsLog<EventRow>(
      supabase, from, to,
      "event_name, user_id, utm_source, utm_medium, utm_campaign, utm_content, referrer, payload_meta",
      platform
    ),
    supabase
      .from("leads")
      .select("user_id, email, utm_source, utm_medium, utm_campaign, utm_content"),
  ]);

  const purchases = purchasesRes.data || [];
  const leads = leadsRes.data || [];

  const utmsFromEventByUser: Record<string, {
    utm_source: string | null; utm_campaign: string | null; utm_medium: string | null; utm_content: string | null;
  }> = {};
  for (const e of events) {
    if (e.event_name === "Purchase" && e.user_id) {
      utmsFromEventByUser[e.user_id as string] = {
        utm_source: e.utm_source as string | null,
        utm_campaign: e.utm_campaign as string | null,
        utm_medium: e.utm_medium as string | null,
        utm_content: e.utm_content as string | null,
      };
    }
  }
  const leadByEmail: Record<string, typeof leads[number]> = {};
  const leadByUserId: Record<string, typeof leads[number]> = {};
  for (const l of leads) {
    if (l.email) leadByEmail[l.email.toLowerCase()] = l;
    if (l.user_id) leadByUserId[l.user_id] = l;
  }

  for (const p of purchases) {
    const fromEvt = p.user_id ? utmsFromEventByUser[p.user_id] : null;
    const fromLeadById = p.user_id ? leadByUserId[p.user_id] : null;
    const fromLeadByEmail = p.email ? leadByEmail[p.email.toLowerCase()] : null;

    if (!p.utm_campaign) p.utm_campaign = fromEvt?.utm_campaign || fromLeadById?.utm_campaign || fromLeadByEmail?.utm_campaign || null;
    if (!p.utm_source) p.utm_source = fromEvt?.utm_source || fromLeadById?.utm_source || fromLeadByEmail?.utm_source || null;
    if (!p.utm_medium) p.utm_medium = fromEvt?.utm_medium || fromLeadById?.utm_medium || fromLeadByEmail?.utm_medium || null;
    if (!p.utm_content) p.utm_content = fromEvt?.utm_content || fromLeadById?.utm_content || fromLeadByEmail?.utm_content || null;
  }

  const utmGroups: Record<string, UtmSourceGroup> = {};

  function ensurePath(src: string, camp: string, med: string, cont: string) {
    if (!utmGroups[src]) utmGroups[src] = { ...newNode(), campaigns: {} };
    if (!utmGroups[src].campaigns[camp]) utmGroups[src].campaigns[camp] = { ...newNode(), mediums: {} };
    if (!utmGroups[src].campaigns[camp].mediums[med]) utmGroups[src].campaigns[camp].mediums[med] = { ...newNode(), contents: {} };
    if (!utmGroups[src].campaigns[camp].mediums[med].contents[cont]) utmGroups[src].campaigns[camp].mediums[med].contents[cont] = newNode();
    return [
      utmGroups[src],
      utmGroups[src].campaigns[camp],
      utmGroups[src].campaigns[camp].mediums[med],
      utmGroups[src].campaigns[camp].mediums[med].contents[cont],
    ];
  }

  // events_log: SOMENTE PageView e InitiateCheckout por UTM.
  // Purchase events NÃO contam aqui — fonte única é a tabela `purchases`.
  // Isso evita dupla contagem quando event existe mas purchase row não (ou vice-versa).
  for (const e of events) {
    const src = e.utm_source || e.referrer || "Direto";
    const camp = e.utm_campaign || "(sem campanha)";
    const med = e.utm_medium || "(sem medium)";
    const cont = e.utm_content || "(sem content)";
    const nodes = ensurePath(src, camp, med, cont);

    if (e.event_name === "PageView") {
      for (const n of nodes) n.pageViews++;
    } else if (e.event_name === "InitiateCheckout") {
      for (const n of nodes) n.checkouts++;
    }
  }

  // purchases: fonte única de verdade pra vendas + revenue.
  // Sem fallback de referrer aqui (coluna não existe em purchases).
  for (const p of purchases) {
    const src = p.utm_source || "Direto";
    const camp = p.utm_campaign || "(sem campanha)";
    const med = p.utm_medium || "(sem medium)";
    const cont = p.utm_content || "(sem content)";
    const nodes = ensurePath(src, camp, med, cont);

    const bruto = Number(p.value);
    const liquido = Number(p.commission_value ?? p.value);

    for (const n of nodes) {
      n.purchases++;
      n.revenueBruto += bruto;
      n.revenueLiquido += liquido;
    }
  }

  const totals = Object.values(utmGroups).reduce(
    (acc, g) => ({
      pageViews: acc.pageViews + g.pageViews,
      checkouts: acc.checkouts + g.checkouts,
      purchases: acc.purchases + g.purchases,
      revenueBruto: acc.revenueBruto + g.revenueBruto,
      revenueLiquido: acc.revenueLiquido + g.revenueLiquido,
    }),
    { pageViews: 0, checkouts: 0, purchases: 0, revenueBruto: 0, revenueLiquido: 0 }
  );

  const currency = dominantCurrency(purchases);

  return { utmGroups, totals, currency };
}
