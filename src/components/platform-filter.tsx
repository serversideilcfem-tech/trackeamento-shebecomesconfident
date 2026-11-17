"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const OPTIONS = [
  { label: "Tudo", value: "" },
  { label: "Meta Ads", value: "meta" },
  { label: "TikTok Ads", value: "tiktok" },
];

function PlatformFilterInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("platform") || "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("platform", value);
    else params.delete("platform");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center rounded-md border border-input overflow-hidden">
      {OPTIONS.map((o) => (
        <button
          key={o.value || "all"}
          onClick={() => select(o.value)}
          className={`px-2.5 py-1 text-xs transition-colors ${
            current === o.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PlatformFilter() {
  return (
    <Suspense fallback={<div className="h-7 w-44 rounded-md bg-muted animate-pulse" />}>
      <PlatformFilterInner />
    </Suspense>
  );
}
