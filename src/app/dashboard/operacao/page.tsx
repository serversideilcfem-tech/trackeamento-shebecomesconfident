export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase";
import { parsePlatform } from "@/lib/platform";
import { getDateRange, getOperationMetrics, getEventStats } from "@/lib/queries";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { HighlightCard } from "@/components/highlight-card";
import { MetricCard } from "@/components/metric-card";
import { DollarSign, ShoppingCart, Link2, RotateCcw, Send, Activity } from "lucide-react";

export default async function OperacaoPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; platform?: string };
}) {
  const { from, to } = getDateRange(searchParams);
  const supabase = createAdminClient();
  const platform = parsePlatform(searchParams.platform);

  const [metrics, eventStats] = await Promise.all([
    getOperationMetrics(supabase, from, to, platform),
    getEventStats(supabase, from, to, platform),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Faturamento Bruto" value={formatCurrency(metrics.revenueBruto, metrics.currency)} icon={ShoppingCart} />
        <HighlightCard
          title="Faturamento Líquido"
          value={formatCurrency(metrics.revenueLiquido, metrics.currency)}
          accent="green"
          icon={DollarSign}
          subtitle={`${metrics.approvedCount} aprovadas`}
        />
        <MetricCard title="Reembolsos" value={formatCurrency(metrics.refundedValue, metrics.currency)} icon={RotateCcw} />
        <MetricCard title="Vendas Reembolsadas" value={metrics.refundedCount.toString()} icon={RotateCcw} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Match Rate" value={formatPercent(metrics.matchRate)} icon={Link2} />
        <MetricCard title="Taxa de Reembolso" value={formatPercent(metrics.refundRate)} icon={RotateCcw} />
        <MetricCard title="Taxa CAPI" value={formatPercent(eventStats.capiRate)} icon={Send} />
        <MetricCard title="Taxa GA4" value={formatPercent(eventStats.ga4Rate)} icon={Activity} />
      </div>
    </div>
  );
}
