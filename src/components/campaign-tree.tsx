"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import { createContext, useContext, useState } from "react";

const CurrencyContext = createContext<string>("BRL");

interface UtmNode {
  pageViews: number;
  checkouts: number;
  purchases: number;
  revenueBruto: number;
  revenueLiquido: number;
}

interface UtmSourceGroup extends UtmNode {
  campaigns: Record<string, UtmNode & {
    mediums: Record<string, UtmNode & {
      contents: Record<string, UtmNode>;
    }>;
  }>;
}

interface CampaignTreeProps {
  utmGroups: Record<string, UtmSourceGroup>;
  currency?: string;
}

const COLS = "grid-cols-[minmax(220px,1.6fr)_repeat(5,minmax(110px,1fr))]";

const LEVEL_STYLES = {
  source: {
    bar: "bg-amber-500",
    bg: "bg-amber-500/[0.04] hover:bg-amber-500/10",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    label: "Fonte",
  },
  campaign: {
    bar: "bg-rose-500",
    bg: "bg-rose-500/[0.03] hover:bg-rose-500/10",
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    label: "Campanha",
  },
  medium: {
    bar: "bg-teal-500",
    bg: "bg-teal-500/[0.03] hover:bg-teal-500/10",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    label: "Meio",
  },
  content: {
    bar: "bg-slate-500",
    bg: "hover:bg-slate-500/10",
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    label: "Conteúdo",
  },
} as const;

type LevelKind = keyof typeof LEVEL_STYLES;

function LevelBadge({ kind }: { kind: LevelKind }) {
  const s = LEVEL_STYLES[kind];
  return (
    <span className={`shrink-0 inline-flex items-center justify-center w-[74px] text-[9px] font-semibold uppercase tracking-wider py-0.5 rounded border ${s.badge}`}>
      {s.label}
    </span>
  );
}

function Cell({ value, bold }: { value: string; bold?: boolean }) {
  return (
    <div className="text-center whitespace-nowrap">
      <span className={`text-xs ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function MetricsCells({ node }: { node: UtmNode }) {
  const currency = useContext(CurrencyContext);
  return (
    <>
      <Cell value={String(node.pageViews)} />
      <Cell value={String(node.checkouts)} />
      <Cell value={String(node.purchases)} />
      <Cell value={formatCurrency(node.revenueBruto, currency)} bold />
      <Cell value={formatCurrency(node.revenueLiquido, currency)} bold />
    </>
  );
}

function Row({
  name,
  node,
  kind,
  level,
  hasChildren,
  open,
  onToggle,
  italic,
}: {
  name: string;
  node: UtmNode;
  kind: LevelKind;
  level: number;
  hasChildren?: boolean;
  open?: boolean;
  onToggle?: () => void;
  italic?: boolean;
}) {
  const s = LEVEL_STYLES[kind];
  const clickable = hasChildren && onToggle;
  return (
    <div
      className={`relative grid ${COLS} gap-2 px-3 py-2 border-b border-border/40 ${s.bg} items-center ${clickable ? "cursor-pointer" : ""}`}
      style={{ paddingLeft: `${16 + level * 24}px` }}
      onClick={clickable ? onToggle : undefined}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${s.bar}`} />
      <div className="flex items-center gap-2 min-w-0">
        {hasChildren ? (
          open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : <span className="w-3" />}
        <LevelBadge kind={kind} />
        <span className={`text-xs truncate ${italic ? "italic text-muted-foreground" : ""}`}>{name}</span>
      </div>
      <MetricsCells node={node} />
    </div>
  );
}

function ContentRow({ name, node, level }: { name: string; node: UtmNode; level: number }) {
  return <Row name={name} node={node} kind="content" level={level} italic />;
}

function MediumRow({
  name,
  data,
  level,
}: {
  name: string;
  data: UtmNode & { contents: Record<string, UtmNode> };
  level: number;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(data.contents);
  return (
    <>
      <Row
        name={name}
        node={data}
        kind="medium"
        level={level}
        hasChildren={entries.length > 0}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && entries.map(([cont, contData]) => (
        <ContentRow key={cont} name={cont} node={contData} level={level + 1} />
      ))}
    </>
  );
}

function CampaignRow({
  name,
  data,
  level,
}: {
  name: string;
  data: UtmNode & { mediums: Record<string, UtmNode & { contents: Record<string, UtmNode> }> };
  level: number;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(data.mediums);
  return (
    <>
      <Row
        name={name}
        node={data}
        kind="campaign"
        level={level}
        hasChildren={entries.length > 0}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && entries.map(([med, medData]) => (
        <MediumRow key={med} name={med} data={medData} level={level + 1} />
      ))}
    </>
  );
}

function SourceRow({ name, data }: { name: string; data: UtmSourceGroup }) {
  const [open, setOpen] = useState(true);
  const entries = Object.entries(data.campaigns);
  return (
    <>
      <Row
        name={name}
        node={data}
        kind="source"
        level={0}
        hasChildren={entries.length > 0}
        open={open}
        onToggle={() => setOpen(!open)}
        italic
      />
      {open && entries.map(([camp, campData]) => (
        <CampaignRow key={camp} name={camp} data={campData} level={1} />
      ))}
    </>
  );
}

export function CampaignTree({ utmGroups, currency = "BRL" }: CampaignTreeProps) {
  const entries = Object.entries(utmGroups);

  return (
    <CurrencyContext.Provider value={currency}>
    <Card>
      <CardHeader>
        <CardTitle>Atribuição por UTM</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={`grid ${COLS} gap-2 px-3 py-2.5 border-b bg-muted/50 items-center sticky top-0 z-10`}>
            <span />
            <span className="text-xs font-semibold text-muted-foreground text-center">PageViews</span>
            <span className="text-xs font-semibold text-muted-foreground text-center">Checkouts</span>
            <span className="text-xs font-semibold text-muted-foreground text-center">Vendas</span>
            <span className="text-xs font-semibold text-muted-foreground text-center">Faturamento</span>
            <span className="text-xs font-semibold text-muted-foreground text-center">Líquido</span>
          </div>

          {entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum dado para o período selecionado.
            </div>
          ) : (
            entries.map(([source, group]) => (
              <SourceRow key={source} name={source} data={group} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
    </CurrencyContext.Provider>
  );
}
