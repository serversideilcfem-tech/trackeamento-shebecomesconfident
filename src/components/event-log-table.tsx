"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { metaStatus, ga4Status, tiktokStatus, sendDetail, type SendStatus } from "@/lib/send-status";
import { formatDateSP } from "@/lib/utils";
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { EventDetailModal } from "./event-detail-modal";
import { Search, Copy, Check } from "lucide-react";

interface EventLogTableProps {
  events: Record<string, unknown>[];
  eventTypes: string[];
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

type SendStatusFilter = "" | "capi_fail" | "ga4_fail" | "tiktok_fail" | "any_fail";

function statuses(event: Record<string, unknown>) {
  return {
    meta: metaStatus(event.response_meta as Record<string, unknown> | null),
    ga4: ga4Status(event.response_ga4 as Record<string, unknown> | null),
    tiktok: tiktokStatus(event.response_tiktok as Record<string, unknown> | null),
  };
}

function StatusBadge({ status, detail }: { status: SendStatus; detail?: string }) {
  if (status === "skip") return <Badge variant="secondary" title={detail}>Skip</Badge>;
  return (
    <Badge variant={status === "ok" ? "success" : "destructive"} title={status === "fail" ? detail : undefined}>
      {status === "ok" ? "OK" : "Falhou"}
    </Badge>
  );
}

export function EventLogTable({ events, eventTypes }: EventLogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlEventFilter = searchParams.get("event") || "";

  // Estado local pra feedback visual imediato no dropdown. A URL é a verdade
  // persistente; o local serve só pra evitar o snap-back enquanto a query
  // server-side (paginada) carrega.
  const [eventTypeFilter, setEventTypeFilter] = useState(urlEventFilter);
  const [isPending, startTransition] = useTransition();

  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"user_id" | "email" | "ip">("user_id");
  const [sendStatusFilter, setSendStatusFilter] = useState<SendStatusFilter>("");

  // Sincroniza estado local com mudanças externas da URL (back/forward do browser).
  useEffect(() => { setEventTypeFilter(urlEventFilter); }, [urlEventFilter]);

  // Reseta a paginação quando o filtro de evento muda.
  useEffect(() => { setPage(0); }, [urlEventFilter]);

  function updateEventFilter(value: string) {
    setEventTypeFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("event", value);
    else params.delete("event");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const perPage = 25;

  let filtered = events;
  // Filtro por event_name acontece server-side via URL. Não filtramos aqui
  // de novo pra evitar dupla-filtragem confusa.
  if (sendStatusFilter) {
    filtered = filtered.filter(e => {
      const st = statuses(e);
      if (sendStatusFilter === "capi_fail")   return st.meta === "fail";
      if (sendStatusFilter === "ga4_fail")    return st.ga4 === "fail";
      if (sendStatusFilter === "tiktok_fail") return st.tiktok === "fail";
      if (sendStatusFilter === "any_fail")    return st.meta === "fail" || st.ga4 === "fail" || st.tiktok === "fail";
      return true;
    });
  }
  if (search) {
    filtered = filtered.filter(e => {
      const val = String(e[searchField] || "").toLowerCase();
      return val.includes(search.toLowerCase());
    });
  }

  const eventCountByUser: Record<string, number> = {};
  for (const e of events) {
    const uid = e.user_id as string;
    if (uid) eventCountByUser[uid] = (eventCountByUser[uid] || 0) + 1;
  }

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  return (
    <div className="relative">
      {isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-md px-3 py-2 shadow-sm">
            <span className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
            Carregando eventos...
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Pesquisar usuario..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={searchField}
          onChange={(e) => setSearchField(e.target.value as "user_id" | "email" | "ip")}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground"
        >
          <option value="user_id">User ID</option>
          <option value="ip">IP</option>
        </select>
        <select
          value={eventTypeFilter}
          onChange={(e) => updateEventFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground"
        >
          <option value="">Todos eventos</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={sendStatusFilter}
          onChange={(e) => { setSendStatusFilter(e.target.value as SendStatusFilter); setPage(0); }}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground"
        >
          <option value="">Todos envios</option>
          <option value="capi_fail">CAPI falhou</option>
          <option value="ga4_fail">GA4 falhou</option>
          <option value="tiktok_fail">TikTok falhou</option>
          <option value="any_fail">Qualquer falha</option>
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>User ID</TableHead>
            <TableHead>Geo</TableHead>
            <TableHead className="text-right">Eventos</TableHead>
            <TableHead>CAPI</TableHead>
            <TableHead>TikTok</TableHead>
            <TableHead>GA4</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((event) => {
            const st = statuses(event);
            const uid = event.user_id as string;
            const geo = [event.city, event.state, event.country].filter(Boolean).join(", ");

            return (
              <TableRow
                key={event.id as string}
                className="cursor-pointer"
                onClick={() => setSelectedEvent(event)}
              >
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateSP(event.created_at as string)}
                </TableCell>
                <TableCell>
                  <Badge variant={
                    event.event_name === "Purchase" ? "success" :
                    event.event_name === "InitiateCheckout" ? "warning" : "secondary"
                  }>{event.event_name as string}</Badge>
                </TableCell>
                <TableCell className="text-xs font-mono max-w-[140px]">
                  <span className="flex items-center gap-1">
                    <span className="truncate">{uid || "-"}</span>
                    {uid && <CopyBtn text={uid} />}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {geo || "-"}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {uid ? eventCountByUser[uid] || 0 : "-"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={st.meta} detail={sendDetail(event.response_meta as Record<string, unknown> | null)} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={st.tiktok} detail={sendDetail(event.response_tiktok as Record<string, unknown> | null)} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={st.ga4} detail={sendDetail(event.response_ga4 as Record<string, unknown> | null)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-3">
          <p className="text-xs text-muted-foreground">{filtered.length} eventos</p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50 hover:bg-accent"
            >
              Anterior
            </button>
            <span className="px-2 py-1 text-xs text-muted-foreground">
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50 hover:bg-accent"
            >
              Proximo
            </button>
          </div>
        </div>
      )}

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
