"use client";

import { useState, useEffect, useRef } from "react";
import { X, User, MapPin, Clock, Send, ArrowLeft, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { metaStatus, ga4Status, tiktokStatus, sendDetail } from "@/lib/send-status";
import { UtmTags } from "@/components/utm-tag";
import { formatDateSP, formatCurrency } from "@/lib/utils";
import { createBrowserClient } from "@supabase/ssr";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface EventDetailModalProps {
  event: AnyRecord | null;
  onClose: () => void;
}

interface UserData {
  lead: AnyRecord | null;
  events: AnyRecord[];
  purchases: AnyRecord[];
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-0.5 rounded hover:bg-accent text-muted-foreground"
      title="Copiar"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function EventDetailModal({ event: initialEvent, onClose }: EventDetailModalProps) {
  const [event, setEvent] = useState<AnyRecord | null>(initialEvent);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync with prop (novo evento clicado na tabela) e rola ao topo só nesse caso
  useEffect(() => {
    setEvent(initialEvent);
    setExpandedId(null);
    panelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [initialEvent]);

  useEffect(() => {
    if (!event) {
      setUserData(null);
      return;
    }
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    if (event.user_id) {
      setLoading(true);
      Promise.all([
        supabase.from("leads").select("*").eq("user_id", event.user_id as string).single(),
        supabase.from("events_log").select("*").eq("user_id", event.user_id as string).order("created_at", { ascending: false }).limit(50),
        supabase.from("purchases").select("*").eq("user_id", event.user_id as string).order("created_at", { ascending: false }),
      ]).then(([leadRes, eventsRes, purchasesRes]) => {
        setUserData({
          lead: leadRes.data,
          events: eventsRes.data || [],
          purchases: purchasesRes.data || [],
        });
        setLoading(false);
      });
    } else if (event.event_name === "Purchase" && event.event_id) {
      setLoading(true);
      supabase
        .from("purchases")
        .select("*")
        .eq("meta_event_id", event.event_id as string)
        .limit(1)
        .then(({ data }) => {
          setUserData({ lead: null, events: [], purchases: data || [] });
          setLoading(false);
        });
    } else {
      setUserData(null);
    }
  }, [event?.user_id, event?.event_id, event?.event_name]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panelRef} className="relative ml-auto w-full max-w-2xl bg-card border-l overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1 rounded hover:bg-accent">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h2 className="font-semibold">Detalhes do Evento</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* 1. User info — name, email, phone — FIRST */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Dados do Usuario
            </h3>
            {loading ? (
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">Carregando...</div>
            ) : (() => {
              const purchase = userData?.purchases?.[0];
              const rw = purchase?.raw_webhook;
              const firstName = rw?.address_first_name || rw?.first_name || "";
              const lastName  = rw?.address_last_name  || rw?.last_name  || "";
              const buyerName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
              const rawPhone = rw?.address_phone_no || rw?.phone_no || null;
              const buyerCountry = rw?.address_country || rw?.country || "";
              const isBR = buyerCountry.toUpperCase() === "BR" || buyerCountry.toLowerCase() === "brasil";
              const buyerPhone = (() => {
                if (!rawPhone) return null;
                const digits = String(rawPhone).replace(/\D/g, "");
                if (!digits) return null;
                if (!isBR) return "+" + digits;
                const hasDDI = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
                return hasDDI ? "+" + digits : "+55" + digits;
              })();
              const buyerEmail = userData?.lead?.email || purchase?.email || rw?.email || rw?.buyer_email || null;
              const buyerDoc = rw?.address_tax_id || rw?.cpf || null;
              const addressStr = rw
                ? [rw.address_street, rw.address_city, rw.address_state, rw.address_zipcode, rw.address_country].filter(Boolean).join(", ") || null
                : null;
              const txId = rw?.transaction_id || rw?.order_id || purchase?.transaction_id || null;
              const matched = purchase?.matched_lead;
              return (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  {purchase && (
                    <div className="flex justify-between items-center pb-1">
                      <span className="text-muted-foreground">Match</span>
                      <Badge variant={matched ? "success" : "secondary"} className="text-[10px]">
                        {matched ? `Matched${purchase.match_type ? ` (${purchase.match_type})` : ""}` : "Unmatched"}
                      </Badge>
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span>{buyerName || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="truncate max-w-[280px]">{buyerEmail || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Telefone</span><span>{buyerPhone || "-"}</span></div>
                  {buyerDoc && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Documento</span><span>{buyerDoc}</span></div>
                  )}
                  {addressStr && (
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Endereco</span><span className="text-right truncate max-w-[320px]">{addressStr}</span></div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="flex items-center gap-1 font-mono text-xs truncate max-w-[220px]">
                      {event.user_id || "-"}
                      {event.user_id && <CopyBtn text={event.user_id as string} />}
                    </span>
                  </div>
                  {txId && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Transaction ID</span>
                      <span className="flex items-center gap-1 font-mono text-xs truncate max-w-[220px]">
                        {txId}
                        <CopyBtn text={String(txId)} />
                      </span>
                    </div>
                  )}
                  {purchase?.product_name && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Produto</span><span className="truncate max-w-[280px]">{purchase.product_name}</span></div>
                  )}
                  {purchase?.value != null && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span>{formatCurrency(Number(purchase.value), purchase.currency)}</span></div>
                  )}
                  {userData?.lead && (
                    <>
                      <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span>{userData.lead.ip || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">FBP</span><span className="font-mono text-xs truncate max-w-[200px]">{userData.lead.fbp || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">FBC</span><span className="font-mono text-xs truncate max-w-[200px]">{userData.lead.fbc || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Primeiro acesso</span><span>{formatDateSP(userData.lead.created_at as string)}</span></div>
                    </>
                  )}
                </div>
              );
            })()}
          </section>

          {/* Webhook Bruto — colapsavel, quando houver purchase */}
          {userData?.purchases?.[0]?.raw_webhook && (
            <section>
              <details className="bg-muted/40 rounded">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-muted-foreground select-none">
                  Webhook Bruto (Digistore24)
                </summary>
                <pre className="px-3 pb-3 text-[10px] overflow-x-auto max-h-[400px] overflow-y-auto">
                  {JSON.stringify(userData.purchases[0].raw_webhook, null, 2)}
                </pre>
              </details>
            </section>
          )}

          {/* 2. User event history with inline expansion */}
          {userData && userData.events.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Historico de Eventos ({userData.events.length})
              </h3>
              <div className="space-y-1.5">
                {userData.events.map((e) => {
                  const isSelected = e.event_id === event.event_id;
                  const isExpanded = expandedId === (e.id as string);
                  const ePayload = e.payload_meta as AnyRecord | null;
                  const eResponse = e.response_meta as AnyRecord | null;
                  return (
                    <div
                      key={e.id as string}
                      className={`rounded-lg text-sm transition-all ${
                        isExpanded
                          ? "bg-primary/10 border-2 border-primary/40 shadow-sm"
                          : isSelected
                          ? "bg-muted/40 border border-primary/30"
                          : "bg-muted/30 border border-transparent hover:bg-accent/50"
                      }`}
                    >
                      <div
                        onClick={(ev) => {
                          ev.preventDefault();
                          setExpandedId((prev) => (prev === (e.id as string) ? null : (e.id as string)));
                        }}
                        className="px-3 py-2.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              e.event_name === "Purchase" ? "success" :
                              e.event_name === "InitiateCheckout" ? "warning" : "secondary"
                            } className="text-xs">{e.event_name as string}</Badge>
                            {isSelected && (
                              <span className="text-[10px] text-primary font-medium">SELECIONADO</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateSP(e.created_at as string)}</span>
                        </div>
                        <UtmTags
                          source={e.utm_source}
                          campaign={e.utm_campaign}
                          medium={e.utm_medium}
                          content={e.utm_content}
                          term={e.utm_term}
                          referrer={e.referrer}
                        />
                      </div>

                      {isExpanded && (
                        <div className="border-t border-primary/30 px-3 py-3 space-y-3 bg-background/40">
                          {/* Evento info */}
                          <div>
                            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <Clock className="h-3 w-3" /> Detalhes
                            </h4>
                            <div className="bg-muted/40 rounded p-2.5 space-y-1 text-xs">
                              <div className="flex justify-between"><span className="text-muted-foreground">Event ID</span><span className="font-mono truncate max-w-[220px]">{e.event_id as string}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span>{e.ip || "-"}</span></div>
                              {([
                                ["CAPI", metaStatus(e.response_meta as AnyRecord | null), sendDetail(e.response_meta as AnyRecord | null)],
                                ["GA4", ga4Status(e.response_ga4 as AnyRecord | null), sendDetail(e.response_ga4 as AnyRecord | null)],
                                ["TikTok", tiktokStatus(e.response_tiktok as AnyRecord | null), sendDetail(e.response_tiktok as AnyRecord | null)],
                              ] as const).map(([label, status, detail]) => (
                                <div key={label} className="flex justify-between items-center">
                                  <span className="text-muted-foreground">{label}</span>
                                  <Badge variant={status === "ok" ? "success" : status === "skip" ? "secondary" : "destructive"} className="text-[10px]" title={detail}>
                                    {status === "ok" ? "Enviado" : status === "skip" ? "Skip" : "Falhou"}
                                  </Badge>
                                </div>
                              ))}
                              {e.platform && (
                                <div className="flex justify-between"><span className="text-muted-foreground">Plataforma</span><span>{e.platform === "tiktok" ? "TikTok Ads" : "Meta Ads"}</span></div>
                              )}
                            </div>
                          </div>

                          {/* Geo */}
                          {(e.country || e.city) && (
                            <div>
                              <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                <MapPin className="h-3 w-3" /> Geolocalizacao
                              </h4>
                              <div className="bg-muted/40 rounded p-2.5 space-y-1 text-xs">
                                {e.country && <div className="flex justify-between"><span className="text-muted-foreground">Pais</span><span>{e.country}</span></div>}
                                {e.state && <div className="flex justify-between"><span className="text-muted-foreground">Estado</span><span>{e.state}</span></div>}
                                {e.city && <div className="flex justify-between"><span className="text-muted-foreground">Cidade</span><span>{e.city}</span></div>}
                              </div>
                            </div>
                          )}

                          {/* Payload */}
                          <div>
                            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <Send className="h-3 w-3" /> Payload Meta
                            </h4>
                            <pre className="bg-muted/40 rounded p-2.5 text-[10px] overflow-x-auto max-h-[260px] overflow-y-auto">
                              {ePayload ? JSON.stringify(ePayload, null, 2) : "N/A"}
                            </pre>
                          </div>

                          {/* Response */}
                          <div>
                            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5">Resposta Meta</h4>
                            <pre className="bg-muted/40 rounded p-2.5 text-[10px] overflow-x-auto max-h-[180px] overflow-y-auto">
                              {eResponse ? JSON.stringify(eResponse, null, 2) : "N/A"}
                            </pre>
                          </div>

                          {/* Payload TikTok (Events API) */}
                          <div>
                            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <Send className="h-3 w-3" /> Payload TikTok
                            </h4>
                            <pre className="bg-muted/40 rounded p-2.5 text-[10px] overflow-x-auto max-h-[260px] overflow-y-auto">
                              {e.payload_tiktok ? JSON.stringify(e.payload_tiktok, null, 2) : "N/A"}
                            </pre>
                          </div>

                          <div>
                            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5">Resposta TikTok</h4>
                            <pre className="bg-muted/40 rounded p-2.5 text-[10px] overflow-x-auto max-h-[180px] overflow-y-auto">
                              {e.response_tiktok ? JSON.stringify(e.response_tiktok, null, 2) : "N/A"}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* User purchases */}
          {userData && userData.purchases.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Compras ({userData.purchases.length})</h3>
              <div className="space-y-2">
                {userData.purchases.map((p) => (
                  <div key={p.id as string} className="bg-muted/50 rounded-lg p-3 text-sm flex justify-between items-center">
                    <div>
                      <p className="font-medium">{p.product_name || "Produto"}</p>
                      <p className="text-xs text-muted-foreground">{formatDateSP(p.created_at as string)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(Number(p.value), p.currency)}</p>
                      <Badge
                        variant={
                          (p.status === "approved" || p.status === "on_payment" || p.status === "on_rebill" || p.status === "complete")
                            ? "success"
                            : "destructive"
                        }
                        className="text-xs"
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
