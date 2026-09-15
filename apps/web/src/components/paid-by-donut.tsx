import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Balance } from "@/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ValueTooltip } from "@/components/value-tooltip";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

const donutColors = ["#0d9488", "#3b82f6", "#f59e0b", "#f43f5e", "#8b5cf6"];

export function PaidByDonut({
  balances,
  currency
}: {
  balances: Balance[];
  currency: string;
}) {
  const { t } = useI18n();

  const data = balances
    .filter((balance) => balance.paid > 0)
    .sort((a, b) => b.paid - a.paid)
    .map((balance, index) => ({
      name: balance.name,
      value: balance.paid / 100,
      fill: donutColors[index % donutColors.length] ?? "#0d9488"
    }));

  if (data.length === 0) {
    return null;
  }

  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <Card className="animate-rise border-border/70">
      <CardHeader>
        <CardTitle>{t("chart.paidBy.title")}</CardTitle>
        <CardDescription>{t("chart.paidBy.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                content={<ValueTooltip currency={currency} />}
                cursor={false}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t("group.total")}
            </span>
            <span className="num text-lg font-semibold leading-tight">
              {formatMoney(Math.round(total * 100), currency)}
            </span>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {data.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="size-2.5 rounded-sm"
                style={{ background: entry.fill }}
              />
              <span className="truncate font-medium text-foreground">
                {entry.name}
              </span>
              <span className="num ml-auto font-medium text-foreground">
                {formatMoney(Math.round(entry.value * 100), currency)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
