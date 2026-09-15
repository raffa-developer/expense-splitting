import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { Group } from "@/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ValueTooltip } from "@/components/value-tooltip";
import { useI18n } from "@/lib/i18n";

const POSITIVE_COLOR = "#0d9488";
const NEGATIVE_COLOR = "#e11d48";

export function BalanceByGroupChart({
  groups,
  currency
}: {
  groups: Group[];
  currency: string;
}) {
  const { t } = useI18n();

  const data = groups
    .filter((group) => (group.your_net ?? 0) !== 0)
    .map((group) => ({
      name: group.name,
      value: (group.your_net ?? 0) / 100
    }));

  if (data.length < 2) {
    return null;
  }

  const height = Math.max(110, data.length * 42);

  return (
    <Card className="animate-rise border-border/70">
      <CardHeader>
        <CardTitle>{t("dashboard.balanceByGroup.title")}</CardTitle>
        <CardDescription>
          {t("dashboard.balanceByGroup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 28, bottom: 4, left: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(128,128,140,0.1)" }}
                content={<ValueTooltip currency={currency} />}
              />
              <Bar dataKey="value" radius={4} barSize={14}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
