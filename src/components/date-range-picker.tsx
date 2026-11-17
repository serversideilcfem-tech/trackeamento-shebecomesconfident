"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/utils";

const PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "Ontem", days: 1 },
  { label: "7d", days: 6 },
  { label: "30d", days: 29 },
];

function formatForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function DateRangePickerInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = toZonedTime(new Date(), TIMEZONE);
  const defaultFrom = formatForInput(startOfDay(subDays(now, 6)));
  const defaultTo = formatForInput(startOfDay(now));

  const fromParam = searchParams.get("from") || defaultFrom;
  const toParam = searchParams.get("to") || defaultTo;

  const [fromDate, setFromDate] = useState(fromParam);
  const [toDate, setToDate] = useState(toParam);

  useEffect(() => {
    setFromDate(fromParam);
    setToDate(toParam);
  }, [fromParam, toParam]);

  function apply(from: string, to: string) {
    // Preserva outros filtros (ex: platform)
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePreset(days: number) {
    const to = formatForInput(startOfDay(now));
    const from = days === 1
      ? formatForInput(startOfDay(subDays(now, 1)))
      : formatForInput(startOfDay(subDays(now, days)));
    const toVal = days === 1 ? from : to;
    setFromDate(from);
    setToDate(toVal);
    apply(from, toVal);
  }

  function handleApply() {
    apply(fromDate, toDate);
  }

  function isPresetActive(days: number): boolean {
    const expectedTo = days === 1
      ? formatForInput(startOfDay(subDays(now, 1)))
      : formatForInput(startOfDay(now));
    const expectedFrom = days === 1
      ? formatForInput(startOfDay(subDays(now, 1)))
      : formatForInput(startOfDay(subDays(now, days)));
    return fromDate === expectedFrom && toDate === expectedTo;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => {
        const active = isPresetActive(p.days);
        return (
          <button
            key={p.label}
            onClick={() => handlePreset(p.days)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input hover:bg-accent text-foreground"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background text-foreground"
        />
        <span className="text-xs text-muted-foreground">a</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-input bg-background text-foreground"
        />
        <button
          onClick={handleApply}
          className="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

export function DateRangePicker() {
  return (
    <Suspense fallback={<div className="h-8 w-48 rounded-md bg-muted animate-pulse" />}>
      <DateRangePickerInner />
    </Suspense>
  );
}
