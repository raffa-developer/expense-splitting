import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <g transform="rotate(-24 16 16)">
        <path d="M16 3 a13 13 0 0 0 0 26 Z" fill="currentColor" />
        <path
          d="M16 3 a13 13 0 0 1 0 26 Z"
          fill="currentColor"
          className="text-chart-2"
        />
        <line
          x1="16"
          y1="2"
          x2="16"
          y2="30"
          className="stroke-background"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
}

export function Logo({
  className,
  wordmark = true,
}: {
  className?: string;
  wordmark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {wordmark ? (
        <span className="font-display text-[15px] font-bold tracking-tight">
          Expense<span className="text-chart-2">.</span>Splitting
        </span>
      ) : null}
    </span>
  );
}
