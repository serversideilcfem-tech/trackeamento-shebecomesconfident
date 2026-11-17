export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase";
import { parsePlatform } from "@/lib/platform";
import { getDateRange, getPurchases } from "@/lib/queries";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { PurchasesTable } from "@/components/purchases-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, CheckCircle, AlertCircle, XCircle } from "lucide-react";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; platform?: string };
}) {
  const { from, to } = getDateRange(searchParams);
  const supabase = createAdminClient();
  const platform = parsePlatform(searchParams.platform);

  const purchases = await getPurchases(supabase, from, to, platform);

  const total = purchases.length;
  const approved = purchases.filter((p) => p.status === "approved");
  const complete = purchases.filter((p) => p.status === "complete");
  const refunded = purchases.filter((p) => p.status === "refunded");

  const nonRefunded = purchases.filter((p) => p.status !== "refunded");
  const totalValue = nonRefunded.reduce((s, p) => s + Number(p.commission_value ?? p.value), 0);
  // Moeda dominante das compras não-reembolsadas
  const totalCurrency = (() => {
    if (!nonRefunded.length) return "BRL";
    const counts: Record<string, number> = {};
    for (const p of nonRefunded) {
      const c = (p.currency || "BRL").toUpperCase();
      counts[c] = (counts[c] || 0) + 1;
    }
    let max = 0, best = "BRL";
    for (const [c, n] of Object.entries(counts)) {
      if (n > max) { max = n; best = c; }
    }
    return best;
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total" value={`${total} (${formatCurrency(totalValue, totalCurrency)})`} icon={ShoppingCart} />
        <MetricCard title="Aprovadas" value={approved.length.toString()} icon={AlertCircle} />
        <MetricCard title="Completas" value={complete.length.toString()} icon={CheckCircle} />
        <MetricCard title="Reembolsadas" value={refunded.length.toString()} icon={XCircle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchasesTable purchases={purchases} />
        </CardContent>
      </Card>
    </div>
  );
}
