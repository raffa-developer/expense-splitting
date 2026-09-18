import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { useGroupNavRegistration } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/auth";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { errorMessage, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/money";

const PAGE_SIZE = 50;

const PaidVsShareChart = lazy(() =>
  import("@/components/paid-vs-share-chart").then((module) => ({
    default: module.PaidVsShareChart
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

type TabValue = "overview" | "expenses" | "people";

export function GroupPage() {
  const { groupId = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [state, setState] = useState<GroupState | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabValue =
    tabParam === "expenses" || tabParam === "people" ? tabParam : "overview";
  const setTab = (value: TabValue) => {
    setSearchParams(value === "overview" ? {} : { tab: value });
  };
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setExpenseOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const myPosition = state
    ? (state.balances.balances.find((balance) => balance.user_id === user?.id)
        ?.balance ?? 0)
    : 0;
  const navInfo = useMemo(
    () =>
      state
        ? {
            id: state.group.id,
            name: state.group.name,
            net: myPosition,
            currency: state.group.currency
          }
        : null,
    [state, myPosition]
  );
  useGroupNavRegistration(navInfo);

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/groups">{t("app.allGroups")}</Link>
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-10 w-72 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const { group, expenses, expensesTotal, balances, settlement, history } =
    state;
  const currency = group.currency;
  const myBalance = balances.balances.find(
    (balance) => balance.user_id === user?.id
  );
  const memberCount = group.members.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold"
            style={avatarStyle(group.name)}
          >
            {initialsOf(group.name)}
          </span>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">
              {group.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {memberCount === 1
                ? t("group.personOne", { count: memberCount })
                : t("group.personMany", { count: memberCount })}
              .{" "}
              {t("group.metaTotal", {
                total: formatMoney(balances.total, currency),
                currency
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expensesTotal > 0 && (
            <>
              <ExpenseDialog
                group={group}
                open={expenseOpen}
                onOpenChange={setExpenseOpen}
                onCreated={() => void load()}
              />
              <BatchExpenseDialog group={group} onCreated={() => void load()} />
            </>
          )}
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
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-3 md:hidden">
          <TabsTrigger value="overview">{t("group.tabOverview")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("group.tabExpenses")}</TabsTrigger>
          <TabsTrigger value="people">{t("group.tabPeople")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="animate-fade space-y-6">
          {expensesTotal === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 py-12 sm:items-center sm:text-center">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("group.emptyExpensesTitle")}
                </h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t("group.emptyExpensesBody")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ExpenseDialog group={group} onCreated={() => void load()} />
                  <BatchExpenseDialog
                    group={group}
                    onCreated={() => void load()}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="grid gap-6 py-6 sm:grid-cols-[auto_1fr] sm:gap-12">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {t("group.yourPosition")}
                    </p>
                    <AnimatedMoney
                      minorUnits={Math.abs(myPosition)}
                      currency={currency}
                      className={cn(
                        "block font-display text-5xl leading-none font-extrabold tracking-tight",
                        myPosition > 0
                          ? "text-positive"
                          : myPosition < 0
                            ? "text-negative"
                            : "text-foreground"
                      )}
                    />
                    <p
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
                    </p>
                  </div>

                  <dl className="grid grid-cols-3 gap-6 sm:border-l sm:border-border sm:pl-12">
                    <div className="space-y-1">
                      <dt className="text-xs text-muted-foreground">
                        {t("group.youPaid")}
                      </dt>
                      <dd className="money text-sm font-medium">
                        {formatMoney(myBalance?.paid ?? 0, currency)}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-xs text-muted-foreground">
                        {t("group.yourShare")}
                      </dt>
                      <dd className="money text-sm font-medium">
                        {formatMoney(myBalance?.owed ?? 0, currency)}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-xs text-muted-foreground">
                        {t("group.youSettled")}
                      </dt>
                      <dd className="money text-sm font-medium">
                        {formatMoney(myBalance?.settled ?? 0, currency)}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <SettleUpCard
                groupId={group.id}
                currency={currency}
                members={group.members}
                highlightUserId={user?.id}
                transactions={settlement.transactions}
                history={history}
                onChanged={() => void load()}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="expenses" className="animate-fade">
            <ExpensesCard
              group={group}
              currency={currency}
              expenses={expenses}
              total={expensesTotal}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMoreExpenses()}
              onDelete={deleteExpense}
              onUpdated={() => void load()}
            />
        </TabsContent>

        <TabsContent value="people" className="animate-fade space-y-6">
          <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
            <PaidVsShareChart currency={currency} balances={balances.balances} />
          </Suspense>
          <BalancesCard currency={currency} balances={balances.balances} />
          <MembersCard group={group} onChanged={() => void load()} />
        </TabsContent>
      </Tabs>

      <DeleteGroupDialog
        group={group}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
