import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Expense, SplitType } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/money";

const splitKeys: Record<SplitType, MessageKey> = {
  equal: "expenses.splitEqual",
  exact: "expenses.splitExact",
  percentage: "expenses.splitPercentage",
  shares: "expenses.splitShares"
};

export function ExpensesCard({
  currency,
  expenses,
  total,
  loadingMore,
  onLoadMore,
  onDelete
}: {
  currency: string;
  expenses: Expense[];
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (expenseId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
      }),
    []
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const expense of expenses) {
      const key = dateFormatter.format(new Date(expense.created_at));
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(expense);
      } else {
        map.set(key, [expense]);
      }
    }
    return [...map.entries()];
  }, [expenses, dateFormatter]);

  return (
    <Card className="animate-rise border-border/70">
      <CardHeader>
        <CardTitle>{t("expenses.title")}</CardTitle>
        <CardDescription>
          {total === 0
            ? t("expenses.empty")
            : total === 1
              ? t("expenses.countOne", { count: total })
              : t("expenses.countMany", { count: total })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("expenses.emptyHint")}
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  {date}
                </p>
                <ul className="mt-1.5 divide-y divide-border/60">
                  {items.map((expense) => (
                    <li
                      key={expense.id}
                      className="group flex items-center gap-3 py-3"
                    >
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-medium"
                        style={avatarStyle(expense.paid_by_name)}
                        title={expense.paid_by_name}
                      >
                        {initialsOf(expense.paid_by_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {expense.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("expenses.paidLine", {
                            name: expense.paid_by_name,
                            amount: formatMoney(expense.amount, currency),
                            split: t(splitKeys[expense.split_type]),
                            count: expense.participants.length,
                            people:
                              expense.participants.length === 1
                                ? t("expenses.personOne")
                                : t("expenses.personMany")
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                        aria-label={t("expenses.deleteAria", {
                          name: expense.description
                        })}
                        onClick={() => setPendingDelete(expense)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {expenses.length < total && (
          <Button
            variant="outline"
            className="mt-4 w-full"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore
              ? t("common.loading")
              : t("expenses.loadMore", { count: total - expenses.length })}
          </Button>
        )}
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("expenses.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("expenses.deleteDescription", {
                name: pendingDelete?.description ?? ""
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!pendingDelete) {
                  return;
                }
                setDeleting(true);
                void onDelete(pendingDelete.id)
                  .then(() => setPendingDelete(null))
                  .finally(() => setDeleting(false));
              }}
            >
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
