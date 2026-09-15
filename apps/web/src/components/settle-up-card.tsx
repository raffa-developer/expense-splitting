import { useState } from "react";
import { ArrowRight, CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type SettlementRecord,
  type SettlementTransaction
} from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { errorMessage, useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

export function SettleUpCard({
  groupId,
  currency,
  transactions,
  history,
  onChanged
}: {
  groupId: string;
  currency: string;
  transactions: SettlementTransaction[];
  history: SettlementRecord[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);

  const markAsPaid = async (transaction: SettlementTransaction) => {
    const key = `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`;
    setPendingKey(key);
    try {
      await api.recordSettlement(groupId, {
        fromUserId: transaction.from_user_id,
        toUserId: transaction.to_user_id,
        amount: transaction.amount
      });
      toast.success(t("settle.recorded"));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setPendingKey(null);
    }
  };

  const undo = async (record: SettlementRecord) => {
    setPendingUndoId(record.id);
    try {
      await api.deleteSettlement(groupId, record.id);
      toast.success(t("settle.removed"));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setPendingUndoId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settle.title")}</CardTitle>
        <CardDescription>{t("settle.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {transactions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            {t("settle.done")}
          </div>
        ) : (
          <ul className="space-y-2">
            {transactions.map((transaction) => {
              const key = `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-medium">{transaction.from_name}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{transaction.to_name}</span>
                    <span className="ml-1 font-medium tabular-nums">
                      {formatMoney(transaction.amount, currency)}
                    </span>
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingKey === key}
                    onClick={() => void markAsPaid(transaction)}
                  >
                    {t("settle.markPaid")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {history.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("settle.recent")}
              </p>
              <ul className="divide-y">
                {history.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {t("settle.paidLine", {
                        from: record.from_name,
                        to: record.to_name,
                        amount: formatMoney(record.amount, currency)
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                      disabled={pendingUndoId === record.id}
                      onClick={() => void undo(record)}
                    >
                      <Undo2 className="size-3.5" /> {t("settle.undo")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
