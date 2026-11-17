export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase";
import { parsePlatform } from "@/lib/platform";
import { getDateRange, getOverviewMetrics, getRevenueByDay, getFunnelData, getEventStats } from "@/lib/queries";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { HighlightCard } from "@/components/highlight-card";
import { RevenueChart } from "@/components/revenue-chart";
import { FunnelChart } from "@/components/funnel-chart";
import { DollarSign, ShoppingCart, Users, MousePointerClick, Link2, Send, Activity, Music2 } from "lucide-react";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; platform?: string };
}) {
  const { from, to } = getDateRange(searchParams);
  const supabase = createAdminClient();
  const platform = parsePlatform(searchParams.platform);

  const [metrics, chartData, funnelData, eventStats] = await Promise.all([
    getOverviewMetrics(supabase, from, to, platform),
    getRevenueByDay(supabase, from, to, platform),
    getFunnelData(supabase, from, to, platform),
    getEventStats(supabase, from, to, platform),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Faturamento Bruto" value={formatCurrency(metrics.revenueBruto, metrics.currency)} icon={DollarSign} />
        <HighlightCard
          title="Faturamento Líquido"
          value={formatCurrency(metrics.revenueLiquido, metrics.currency)}
          accent="green"
          icon={DollarSign}
          subtitle="Após taxa da Digistore"
        />
        <MetricCard title="Compras" value={metrics.purchaseCount.toString()} icon={ShoppingCart} />
        <MetricCard title="Leads Únicos" value={metrics.uniqueUsers.toString()} icon={Users} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard title="Taxa de Conversão" value={formatPercent(metrics.convRate)} icon={MousePointerClick} />
        <MetricCard title="Taxa de Match" value={formatPercent(metrics.matchRate)} icon={Link2} />
        <MetricCard title="Taxa CAPI" value={formatPercent(eventStats.capiRate)} icon={Send} />
        <MetricCard title="Taxa GA4" value={formatPercent(eventStats.ga4Rate)} icon={Activity} />
        <MetricCard title="Taxa TikTok" value={formatPercent(eventStats.tiktokRate)} icon={Music2} />
      </div>

      <RevenueChart data={chartData.days} currency={chartData.currency} />
      <FunnelChart data={funnelData} />
    </div>
  );
}
