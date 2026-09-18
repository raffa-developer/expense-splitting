import type { Balance } from "@/api";
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
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

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
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("balances.person")}</TableHead>
              <TableHead className="text-right">{t("balances.paid")}</TableHead>
              <TableHead className="text-right">
                {t("balances.position")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((balance) => (
              <TableRow key={balance.user_id}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium"
                      style={avatarStyle(balance.name)}
                    >
                      {initialsOf(balance.name)}
                    </span>
                    <span className="truncate font-medium">{balance.name}</span>
                  </span>
                </TableCell>
                <TableCell className="money text-right text-muted-foreground">
                  {formatMoney(balance.paid, currency)}
                </TableCell>
                <TableCell className="text-right">
                  {balance.balance > 0 ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="money text-sm font-medium text-positive">
                        {formatMoney(balance.balance, currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("balances.getsBackLabel")}
                      </span>
                    </span>
                  ) : balance.balance < 0 ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="money text-sm font-medium text-negative">
                        {formatMoney(-balance.balance, currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("balances.owesLabel")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("balances.settled")}
                    </span>
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
