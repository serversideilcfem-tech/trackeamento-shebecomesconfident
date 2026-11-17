import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface HighlightCardProps {
  title: string;
  value: string;
  accent: "blue" | "green" | "red";
  icon?: LucideIcon;
  subtitle?: string;
}

const accentStyles = {
  blue: "border-l-4 border-l-blue-500",
  green: "border-l-4 border-l-emerald-500",
  red: "border-l-4 border-l-red-500",
};

const accentBg = {
  blue: "bg-blue-500/10",
  green: "bg-emerald-500/10",
  red: "bg-red-500/10",
};

const accentText = {
  blue: "text-blue-500",
  green: "text-emerald-500",
  red: "text-red-500",
};

export function HighlightCard({ title, value, accent, icon: Icon, subtitle }: HighlightCardProps) {
  return (
    <Card className={cn("overflow-hidden", accentStyles[accent])}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className={cn("text-3xl font-bold tracking-tight", accentText[accent])}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn("rounded-lg p-2.5", accentBg[accent])}>
              <Icon className={cn("h-4 w-4", accentText[accent])} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
