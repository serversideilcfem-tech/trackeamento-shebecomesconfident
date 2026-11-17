import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, toZonedTime } from "date-fns-tz";

// Fuso do dashboard (datas, filtros "Hoje/Ontem", gráfico por dia).
// Brasília (UTC-3, sem horário de verão).
export const TIMEZONE = "Europe/Rome";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Locale default por moeda — afeta separadores/formatação visual.
const LOCALE_FOR_CURRENCY: Record<string, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  ARS: "es-AR",
  MXN: "es-MX",
  CLP: "es-CL",
  COP: "es-CO",
};

export function formatCurrency(value: number, currency: string = "BRL"): string {
  const cur = (currency || "BRL").toUpperCase();
  const locale = LOCALE_FOR_CURRENCY[cur] || "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
    }).format(value);
  } catch {
    // Moeda inválida — fallback formato genérico
    return `${cur} ${value.toFixed(2)}`;
  }
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDateSP(date: Date | string, fmt: string = "dd/MM/yyyy HH:mm"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zoned = toZonedTime(d, TIMEZONE);
  return format(zoned, fmt, { timeZone: TIMEZONE });
}

export function calcROAS(revenue: number, spend: number): number {
  if (spend === 0) return 0;
  return revenue / spend;
}
