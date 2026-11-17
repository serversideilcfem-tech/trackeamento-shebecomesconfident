export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase";
import { parsePlatform } from "@/lib/platform";
import { getDateRange, getEventStats, getEventsLog } from "@/lib/queries";
import { formatPercent } from "@/lib/utils";
import { MetricCard } from "@/components/metric-card";
import { EventLogTable } from "@/components/event-log-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, ShoppingCart, MousePointerClick, Users, Wifi } from "lucide-react";

export default async function EventosPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; event?: string; platform?: string };
}) {
  const { from, to } = getDateRange(searchParams);
  const supabase = createAdminClient();
  const platform = parsePlatform(searchParams.platform);
  const eventName = searchParams.event || undefined;

  const [stats, events] = await Promise.all([
    getEventStats(supabase, from, to, platform),
    getEventsLog(supabase, from, to, 500, eventName, platform),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <MetricCard title="PageViews" value={stats.pageViews.toLocaleString()} icon={Eye} />
        <MetricCard title="Checkouts" value={stats.checkouts.toLocaleString()} icon={MousePointerClick} />
        <MetricCard title="Purchases" value={stats.purchases.toLocaleString()} icon={ShoppingCart} />
        <MetricCard title="Usuarios Unicos" value={stats.uniqueUsers.toLocaleString()} icon={Users} />
        <MetricCard title="Taxa CAPI" value={formatPercent(stats.capiRate)} icon={Wifi} />
        <MetricCard title="Taxa GA4" value={formatPercent(stats.ga4Rate)} icon={Wifi} />
        <MetricCard title="Taxa TikTok" value={formatPercent(stats.tiktokRate)} icon={Wifi} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log de Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <EventLogTable events={events} eventTypes={stats.eventNames} />
        </CardContent>
      </Card>
    </div>
  );
}
