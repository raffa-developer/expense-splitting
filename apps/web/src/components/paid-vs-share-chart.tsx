import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { Balance } from "@/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

const PAID_COLOR = "#0d9488";
const SHARE_COLOR = "#a1a1aa";

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

interface BarTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  currency: string;
  paidLabel: string;
  shareLabel: string;
}

function BarTooltip({
  active,
  label,
  payload,
  currency,
  paidLabel,
  shareLabel
}: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry) => (
          <li
            key={String(entry.dataKey)}
            className="flex items-center gap-1.5 text-muted-foreground"
          >
            <span
              className="size-2 rounded-sm"
              style={{ background: entry.color }}
            />
            {entry.dataKey === "paid" ? paidLabel : shareLabel}
            <span className="ml-auto pl-3 font-medium tabular-nums text-popover-foreground">
              {formatMoney(Math.round(Number(entry.value ?? 0) * 100), currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaidVsShareChart({
  currency,
  balances
}: {
  currency: string;
  balances: Balance[];
}) {
  const { t } = useI18n();

  const data = balances.map((balance) => ({
    name: balance.name,
    paid: balance.paid / 100,
    share: balance.owed / 100
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("chart.title")}</CardTitle>
        <CardDescription>{t("chart.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
              barGap={2}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="rgba(128,128,140,0.25)"
              />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                interval={0}
                tickFormatter={(value: string) =>
                  value.length > 7 ? `${value.slice(0, 7)}…` : value
                }
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "rgba(128,128,140,0.12)" }}
                content={
                  <BarTooltip
                    currency={currency}
                    paidLabel={t("chart.paid")}
                    shareLabel={t("chart.share")}
                  />
                }
              />
              <Bar dataKey="paid" fill={PAID_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="share" fill={SHARE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: PAID_COLOR }}
            />
            {t("chart.paid")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: SHARE_COLOR }}
            />
            {t("chart.share")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
