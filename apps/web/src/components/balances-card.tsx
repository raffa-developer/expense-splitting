import type { Balance } from "@/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export function BalancesCard({
  currency,
  balances
}: {
  currency: string;
  balances: Balance[];
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("balances.title")}</CardTitle>
        <CardDescription>{t("balances.description")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t("balances.person")}</TableHead>
              <TableHead className="text-right">{t("balances.paid")}</TableHead>
              <TableHead className="pr-6 text-right">
                {t("balances.position")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((balance) => (
              <TableRow key={balance.user_id}>
                <TableCell className="pl-6">
                  <span className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                      {initials(balance.name)}
                    </span>
                    <span className="truncate font-medium">{balance.name}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatMoney(balance.paid, currency)}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {balance.balance > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    >
                      {t("balances.getsBack", {
                        amount: formatMoney(balance.balance, currency)
                      })}
                    </Badge>
                  ) : balance.balance < 0 ? (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 text-destructive"
                    >
                      {t("balances.owes", {
                        amount: formatMoney(-balance.balance, currency)
                      })}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t("balances.settled")}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
