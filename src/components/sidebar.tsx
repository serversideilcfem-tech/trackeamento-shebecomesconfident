"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useState, Suspense } from "react";

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Preserve date params across navigation
  const dateParams = new URLSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  if (fromParam) dateParams.set("from", fromParam);
  if (toParam) dateParams.set("to", toParam);
  const queryString = dateParams.toString() ? `?${dateParams.toString()}` : "";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const nav = (
    <>
      <div className="flex items-center gap-2 px-4 py-6">
        <BrandLogo className="h-8 w-8 rounded-lg" iconClassName="h-5 w-5" />
        <span className="font-semibold text-base text-foreground tracking-tight">
          Trackeamento<span className="text-cyan-400">.</span>Online
        </span>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={`${item.href}${queryString}`}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-card border lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {nav}
      </aside>
    </>
  );
}

export function Sidebar() {
  return (
    <Suspense>
      <SidebarInner />
    </Suspense>
  );
}
