import { formatMoney } from "@/money";

interface ValueTooltipEntry {
  value?: number | string;
  payload?: Record<string, unknown>;
}

interface ValueTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ValueTooltipEntry[];
  currency: string;
  valueMultiplier?: number;
}

export function ValueTooltip({
  active,
  label,
  payload,
  currency,
  valueMultiplier = 100
}: ValueTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const entry = payload[0];
  if (!entry) {
    return null;
  }

  const name =
    (typeof label === "string" || typeof label === "number"
      ? label
      : undefined) ??
    (typeof entry.payload?.name === "string" ? entry.payload.name : "");

  const value = Number(entry.value ?? 0) * valueMultiplier;

  return (
    <div className="min-w-32 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {name ? (
        <p className="font-medium text-popover-foreground">{name}</p>
      ) : null}
      <p className="mt-0.5 num font-medium text-popover-foreground">
        {formatMoney(Math.round(value), currency)}
      </p>
    </div>
  );
}
