"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateSP, formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { EventDetailModal } from "./event-detail-modal";

interface Purchase {
  id: string;
  created_at: string;
  email: string | null;
  product_name: string | null;
  value: number;
  commission_value: number | null;
  status: string;
  matched_lead: boolean;
  match_type: string | null;
  utm_source: string | null;
  referrer: string | null;
  user_id: string | null;
  first_name_hash: string | null;
  phone_hash: string | null;
  response_meta: Record<string, unknown> | null;
  raw_webhook: Record<string, unknown> | null;
  meta_event_id: string | null;
  payload_meta?: Record<string, unknown> | null;
}

interface PurchasesTableProps {
  purchases: Purchase[];
}

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  approved: { label: "Aprovada", variant: "success" },
  on_payment: { label: "Aprovada", variant: "success" },
  on_rebill: { label: "Recorrência", variant: "success" },
  complete: { label: "Completa", variant: "success" },
  refunded: { label: "Reembolsada", variant: "destructive" },
  on_refund: { label: "Reembolsada", variant: "destructive" },
  chargeback: { label: "Chargeback", variant: "destructive" },
  on_chargeback: { label: "Chargeback", variant: "destructive" },
};

export function PurchasesTable({ purchases }: PurchasesTableProps) {
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const perPage = 20;
  const paged = purchases.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(purchases.length / perPage);

  // Build a fake event object for the modal when clicking a purchase
  const selectedEvent = selectedUserId ? {
    user_id: selectedUserId,
    event_name: "Purchase",
    created_at: purchases.find(p => p.user_id === selectedUserId)?.created_at || "",
    event_id: purchases.find(p => p.user_id === selectedUserId)?.meta_event_id || "",
    id: selectedUserId,
    ip: null,
    country: null,
    state: null,
    city: null,
    utm_source: purchases.find(p => p.user_id === selectedUserId)?.utm_source || null,
    utm_medium: null,
    utm_campaign: null,
    payload_meta: null,
    response_meta: purchases.find(p => p.user_id === selectedUserId)?.response_meta || null,
  } : null;

  // Extract buyer name/phone from Digistore raw_webhook (address_first_name + address_last_name / address_phone_no)
  function getBuyerName(p: Purchase): string {
    const rw = p.raw_webhook as Record<string, unknown> | null;
    if (!rw) return "-";
    const first = (rw.address_first_name as string) || (rw.first_name as string) || "";
    const last  = (rw.address_last_name  as string) || (rw.last_name  as string) || "";
    const full = [first, last].filter(Boolean).join(" ").trim();
    return full || "-";
  }

  function getBuyerPhone(p: Purchase): string {
    const rw = p.raw_webhook as Record<string, unknown> | null;
    if (!rw) return "-";
    return (rw.address_phone_no as string) || (rw.phone_no as string) || "-";
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">Comissão</TableHead>
            <TableHead>Fonte</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((p) => {
            const cfg = statusConfig[p.status] || { label: p.status, variant: "secondary" as const };
            return (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => p.user_id && setSelectedUserId(p.user_id)}
              >
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateSP(p.created_at, "dd/MM HH:mm")}
                </TableCell>
                <TableCell className="text-sm truncate max-w-[120px]">
                  {getBuyerName(p)}
                </TableCell>
                <TableCell className="text-sm truncate max-w-[160px]">
                  {p.email || "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {getBuyerPhone(p)}
                </TableCell>
                <TableCell className="text-sm truncate max-w-[120px]">
                  {p.product_name || "-"}
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">
                  {formatCurrency(Number(p.commission_value ?? p.value), (p as unknown as { currency?: string }).currency)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {p.utm_source || p.referrer || "Direto"}
                </TableCell>
                <TableCell>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </TableCell>
                <TableCell>
                  {p.matched_lead ? (
                    <Badge variant="success">{p.match_type}</Badge>
                  ) : (
                    <Badge variant="destructive">none</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-3">
          <p className="text-xs text-muted-foreground">{purchases.length} compras</p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-xs rounded border disabled:opacity-50 hover:bg-accent"
            >
              Anterior
            </button>
            <span className="px-2 py-1 text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
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

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}
