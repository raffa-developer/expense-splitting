import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatSignedMoney } from "@/money";

export function NetValue({
  net,
  currency,
  className,
  pill = false
}: {
  net: number;
  currency: string;
  className?: string;
  pill?: boolean;
}) {
  const { t } = useI18n();

  if (net === 0) {
    return (
      <span
        className={cn(
          "text-xs text-muted-foreground",
          pill && "rounded-full bg-muted px-3 py-1",
          className
        )}
      >
        {t("balances.settled")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "money text-sm font-medium",
        net > 0 ? "text-positive" : "text-negative",
        pill && "rounded-full px-3 py-1",
        pill && (net > 0 ? "bg-positive/12" : "bg-accent"),
        className
      )}
    >
      {formatSignedMoney(net, currency)}
    </span>
  );
}
