import { lazy, Suspense, useState } from "react";
import { ArrowRight, CheckCircle2, Undo2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  api,
  type Member,
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
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

const MoneyFlowGraph = lazy(() =>
  import("@/components/money-flow-graph").then((module) => ({
    default: module.MoneyFlowGraph
  }))
);

export function SettleUpCard({
  groupId,
  currency,
  members,
  highlightUserId,
  transactions,
  history,
  onChanged
}: {
  groupId: string;
  currency: string;
  members: Member[];
  highlightUserId?: string | undefined;
  transactions: SettlementTransaction[];
  history: SettlementRecord[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
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
          <div className="flex items-center gap-2.5 rounded-2xl bg-accent p-4 text-sm font-medium text-accent-foreground">
            <CheckCircle2 className="size-4" />
            {t("settle.done")}
          </div>
        ) : (
          <>
            {members.length <= 12 && (
              <div className="hidden space-y-2 sm:block">
                <div className="mx-auto max-w-xl">
                  <Suspense fallback={<Skeleton className="h-56 w-full" />}>
                    <MoneyFlowGraph
                      members={members}
                      transactions={transactions}
                      currency={currency}
                      highlightUserId={highlightUserId}
                    />
                  </Suspense>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t("flow.hint")}
                </p>
              </div>
            )}

            <ul className="space-y-2">
              {transactions.map((transaction) => {
                const key = `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`;
                return (
                  <motion.li
                    key={key}
                    layout={!reduce}
                    animate={{ opacity: pendingKey === key ? 0.55 : 1 }}
                    transition={{ duration: 0.18, ease: [0.2, 1, 0.2, 1] }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium">
                        {transaction.from_name}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {transaction.to_name}
                      </span>
                      <span className="money ml-1 font-medium">
                        {formatMoney(transaction.amount, currency)}
                      </span>
                    </p>
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={pendingKey === key}
                      onClick={() => void markAsPaid(transaction)}
                    >
                      {t("settle.markPaid")}
                    </Button>
                  </motion.li>
                );
              })}
            </ul>
          </>
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
