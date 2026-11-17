export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase";
import { parsePlatform } from "@/lib/platform";
import { getDateRange, getCampaignAttribution } from "@/lib/queries";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { HighlightCard } from "@/components/highlight-card";
import { CampaignTree } from "@/components/campaign-tree";
import { DollarSign, ShoppingCart } from "lucide-react";

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; platform?: string };
}) {
  const { from, to } = getDateRange(searchParams);
  const supabase = createAdminClient();
  const platform = parsePlatform(searchParams.platform);

  const { utmGroups, totals, currency } = await getCampaignAttribution(supabase, from, to, platform);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Faturamento Bruto" value={formatCurrency(totals.revenueBruto, currency)} icon={DollarSign} />
        <HighlightCard
          title="Faturamento Líquido"
          value={formatCurrency(totals.revenueLiquido, currency)}
          accent="green"
          icon={DollarSign}
          subtitle={`${totals.purchases} vendas atribuídas`}
        />
        <MetricCard title="Total de Vendas" value={totals.purchases.toString()} icon={ShoppingCart} />
      </div>

      <CampaignTree utmGroups={utmGroups} currency={currency} />
    </div>
  );
}
