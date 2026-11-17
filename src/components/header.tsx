"use client";

import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { DateRangePicker } from "./date-range-picker";
import { PlatformFilter } from "./platform-filter";
import { ThemeToggle } from "./theme-toggle";
import { LogOut, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();

  const current = NAV_ITEMS.find((item) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.href);
  });

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between px-4 lg:px-6 h-auto min-h-[56px] py-2 border-b bg-card gap-4 flex-wrap">
      <h1 className="text-lg font-semibold text-foreground pl-12 lg:pl-0">
        {current?.label || "Dashboard"}
      </h1>
      <div className="flex items-center gap-2 flex-wrap">
        <PlatformFilter />
        <DateRangePicker />
        <button
          onClick={() => router.refresh()}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Atualizar"
          title="Atualizar dados"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
