import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import { AnimatedMoney } from "@/components/animated-money";
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
  Card,
  CardContent
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth";
import { errorMessage, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/money";

const PAGE_SIZE = 50;

const PaidVsShareChart = lazy(() =>
  import("@/components/paid-vs-share-chart").then((module) => ({
    default: module.PaidVsShareChart
  }))
);

const PaidByDonut = lazy(() =>
  import("@/components/paid-by-donut").then((module) => ({
    default: module.PaidByDonut
  }))
);

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
  const { user } = useAuth();
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
        <Skeleton className="h-44 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const { group, expenses, expensesTotal, balances, settlement, history } =
    state;
  const currency = group.currency;
  const myBalance = balances.balances.find(
    (balance) => balance.user_id === user?.id
  );
  const myPosition = myBalance?.balance ?? 0;

  return (
    <div className="space-y-6">
      <Card className="animate-rise overflow-hidden border-border/70">
        <CardContent className="grid gap-6 py-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
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
            <h1 className="text-3xl font-semibold tracking-tight">
              {group.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {group.members.length === 1
                ? t("group.personOne", { count: group.members.length })
                : t("group.personMany", { count: group.members.length })}{" "}
              · {currency} · {t("group.total")}{" "}
              {formatMoney(balances.total, currency)}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ExpenseDialog group={group} onCreated={() => void load()} />
              <BatchExpenseDialog group={group} onCreated={() => void load()} />
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

          <div className="flex flex-col gap-4 border-border/70 lg:min-w-64 lg:border-l lg:pl-8">
            <div className="space-y-1">
              <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("group.yourPosition")}
              </span>
              <AnimatedMoney
                minorUnits={Math.abs(myPosition)}
                currency={currency}
                className={cn(
                  "num block text-4xl font-semibold leading-none tracking-tight",
                  myPosition > 0
                    ? "text-positive"
                    : myPosition < 0
                      ? "text-negative"
                      : "text-foreground"
                )}
              />
              <span
                className={cn(
                  "text-sm",
                  myPosition > 0
                    ? "text-positive"
                    : myPosition < 0
                      ? "text-negative"
                      : "text-muted-foreground"
                )}
              >
                {myPosition > 0
                  ? t("balances.getsBackLabel")
                  : myPosition < 0
                    ? t("balances.owesLabel")
                    : t("balances.settled")}
              </span>
            </div>

            <dl className="grid grid-cols-3 gap-4 text-sm lg:grid-cols-3">
              <div className="space-y-0.5">
                <dt className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
                  {t("group.youPaid")}
                </dt>
                <dd className="num font-medium">
                  {formatMoney(myBalance?.paid ?? 0, currency)}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
                  {t("group.yourShare")}
                </dt>
                <dd className="num font-medium">
                  {formatMoney(myBalance?.owed ?? 0, currency)}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
                  {t("group.youSettled")}
                </dt>
                <dd className="num font-medium">
                  {formatMoney(myBalance?.settled ?? 0, currency)}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <SettleUpCard
            groupId={group.id}
            currency={currency}
            members={group.members}
            highlightUserId={user?.id}
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
          <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
            <PaidByDonut balances={balances.balances} currency={currency} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
            <PaidVsShareChart currency={currency} balances={balances.balances} />
          </Suspense>
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
