import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  delay = 0,
  className
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
  icon?: ReactNode;
  delay?: number;
  className?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground";

  return (
    <Card
      className={cn(
        "animate-rise border-border/70 shadow-xs transition-shadow hover:shadow-sm",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              "num text-3xl font-semibold leading-none tracking-tight",
              toneClass
            )}
          >
            {value}
          </p>
          {sub ? (
            <p className="truncate text-xs text-muted-foreground">{sub}</p>
          ) : null}
        </div>
        {icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
