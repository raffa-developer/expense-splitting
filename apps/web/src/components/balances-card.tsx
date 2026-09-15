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
    <Card className="animate-rise border-border/70">
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
                  <span className="flex items-center gap-2.5">
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-medium"
                      style={avatarStyle(balance.name)}
                    >
                      {initialsOf(balance.name)}
                    </span>
                    <span className="truncate font-medium">{balance.name}</span>
                  </span>
                </TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {formatMoney(balance.paid, currency)}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {balance.balance > 0 ? (
                    <Badge
                      variant="outline"
                      className="num border-positive/40 text-positive"
                    >
                      {t("balances.getsBack", {
                        amount: formatMoney(balance.balance, currency)
                      })}
                    </Badge>
                  ) : balance.balance < 0 ? (
                    <Badge
                      variant="outline"
                      className="num border-negative/40 text-negative"
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
