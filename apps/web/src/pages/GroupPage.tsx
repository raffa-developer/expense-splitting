import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, MoreHorizontal, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  api,
  type BalancesResponse,
  type Expense,
  type GroupDetail,
  type SettlementRecord,
  type SettlementResponse
} from "@/api";
import { BalancesCard } from "@/components/balances-card";
import { BatchExpenseDialog } from "@/components/batch-expense-dialog";
import { DeleteGroupDialog } from "@/components/delete-group-dialog";
import { ExpenseDialog } from "@/components/expense-dialog";
import { ExpensesCard } from "@/components/expenses-card";
import { MembersCard } from "@/components/members-card";
import { SettleUpCard } from "@/components/settle-up-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

const PAGE_SIZE = 50;

interface GroupState {
  group: GroupDetail;
  expenses: Expense[];
  expensesTotal: number;
  balances: BalancesResponse;
  settlement: SettlementResponse;
  history: SettlementRecord[];
}

export function GroupPage() {
  const { groupId = "" } = useParams();
  const { t } = useI18n();
  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [group, expensePage, balances, settlement, history] =
        await Promise.all([
          api.getGroup(groupId),
          api.listExpenses(groupId, { limit: PAGE_SIZE, offset: 0 }),
          api.getBalances(groupId),
          api.getSettlement(groupId),
          api.listSettlements(groupId)
        ]);
      setState({
        group,
        expenses: expensePage.expenses,
        expensesTotal: expensePage.total,
        balances,
        settlement,
        history
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }, [groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMoreExpenses = async () => {
    if (!state) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await api.listExpenses(groupId, {
        limit: PAGE_SIZE,
        offset: state.expenses.length
      });
      setState({
        ...state,
        expenses: [...state.expenses, ...page.expenses],
        expensesTotal: page.total
      });
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setLoadingMore(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      await api.deleteExpense(groupId, expenseId);
      toast.success(t("expenses.deleted"));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/">
            <ChevronLeft /> {t("group.back")}
          </Link>
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const { group, expenses, expensesTotal, balances, settlement, history } =
    state;
  const currency = group.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
          >
            <Link to="/">
              <ChevronLeft /> {t("group.back")}
            </Link>
          </Button>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {group.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {group.members.length === 1
              ? t("group.personOne", { count: group.members.length })
              : t("group.personMany", { count: group.members.length })}{" "}
            · {currency} · {t("group.total")}{" "}
            {formatMoney(balances.total, currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BatchExpenseDialog group={group} onCreated={() => void load()} />
          <ExpenseDialog group={group} onCreated={() => void load()} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("group.options")}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> {t("group.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <SettleUpCard
            groupId={group.id}
            currency={currency}
            transactions={settlement.transactions}
            history={history}
            onChanged={() => void load()}
          />
          <ExpensesCard
            currency={currency}
            expenses={expenses}
            total={expensesTotal}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMoreExpenses()}
            onDelete={deleteExpense}
          />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <BalancesCard currency={currency} balances={balances.balances} />
          <MembersCard group={group} onChanged={() => void load()} />
        </div>
      </div>

      <DeleteGroupDialog
        group={group}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
