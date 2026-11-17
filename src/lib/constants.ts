import {
  LayoutDashboard,
  Activity,
  Settings2,
  Megaphone,
  ShoppingCart,
  Cog,
} from "lucide-react";

export { TIMEZONE } from "./utils";
export const DEFAULT_PERIOD = "7d";

export const PERIOD_OPTIONS = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
] as const;

export const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Eventos", href: "/dashboard/eventos", icon: Activity },
  { label: "Operacao", href: "/dashboard/operacao", icon: Settings2 },
  { label: "Campanhas", href: "/dashboard/campanhas", icon: Megaphone },
  { label: "Compras", href: "/dashboard/compras", icon: ShoppingCart },
  { label: "Configuracoes", href: "/dashboard/configuracoes", icon: Cog },
] as const;
