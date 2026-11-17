"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface ChartData {
  date: string;
  faturamento: number;
  faturamento_liquido: number;
}

interface RevenueChartProps {
  data: ChartData[];
  currency?: string;
}

function CustomTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string; currency?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value, currency)}
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data, currency }: RevenueChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: d.date.split("-").reverse().slice(0, 2).join("/"),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturamento por dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted}>
              <defs>
                <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorLiq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="faturamento"
                name="Faturamento Bruto"
                stroke="#10b981"
                fill="url(#colorFat)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="faturamento_liquido"
                name="Faturamento Líquido"
                stroke="#22d3ee"
                fill="url(#colorLiq)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
