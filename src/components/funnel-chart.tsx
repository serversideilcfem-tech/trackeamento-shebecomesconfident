"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
}

interface FunnelChartProps {
  data: FunnelStage[];
}

export function FunnelChart({ data }: FunnelChartProps) {
  const colors = ["#3b82f6", "#f59e0b", "#10b981"];
  const bgColors = ["rgba(59,130,246,0.12)", "rgba(245,158,11,0.12)", "rgba(16,185,129,0.12)"];

  // Width percentages for each stage (top=100%, narrowing down)
  const widths = [100, 65, 35];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil de Conversao</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-lg mx-auto">
          {data.map((stage, i) => {
            const topW = widths[i] ?? 30;
            const bottomW = widths[i + 1] ?? topW * 0.5;
            const nextRate = i < data.length - 1 ? data[i + 1].rate : null;
            const isLast = i === data.length - 1;

            return (
              <div key={stage.stage} className="flex flex-col items-center">
                {/* Trapezoid via SVG */}
                <div className="relative w-full" style={{ height: "80px" }}>
                  <svg
                    viewBox="0 0 400 80"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                  >
                    <polygon
                      points={`${200 - topW * 2},0 ${200 + topW * 2},0 ${200 + (isLast ? bottomW * 1.5 : bottomW * 2)},80 ${200 - (isLast ? bottomW * 1.5 : bottomW * 2)},80`}
                      fill={bgColors[i]}
                      stroke={colors[i]}
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {stage.stage}
                      </p>
                      <p className="text-2xl font-bold" style={{ color: colors[i] }}>
                        {stage.count.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Conversion arrow between stages */}
                {nextRate !== null && (
                  <div className="flex items-center gap-2 py-1 -my-0.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground">
                      <path d="M6 0 L6 8 M2 5 L6 9 L10 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    <span className="text-xs font-bold" style={{ color: colors[i + 1] }}>
                      {nextRate.toFixed(1)}%
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground">
                      <path d="M6 0 L6 8 M2 5 L6 9 L10 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {data.length >= 3 && data[0].count > 0 && (
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Conversao Total</p>
            <p className="text-lg font-bold text-foreground">
              {((data[2].count / data[0].count) * 100).toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {data[0].count.toLocaleString()} visitantes → {data[2].count.toLocaleString()} compras
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
