import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type Group } from "@/api";
import { NetValue } from "@/components/net-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { errorMessage, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/money";

function currencyTotals(groups: Group[]): { code: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    totals.set(
      group.currency,
      (totals.get(group.currency) ?? 0) + (group.your_net ?? 0)
    );
  }
  return Array.from(totals, ([code, total]) => ({ code, total })).sort(
    (a, b) => Math.abs(b.total) - Math.abs(a.total)
  );
}

function AvatarCluster({ groups }: { groups: Group[] }) {
  const reduce = useReducedMotion();
  const names = groups.slice(0, 4).map((group) => group.name);

  if (names.length === 0) {
    return null;
  }

  return (
    <motion.div
      aria-hidden="true"
      className="flex -space-x-3"
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
    >
      {names.map((name, index) => (
        <motion.span
          key={`${name}-${index}`}
          variants={{
            hidden: { opacity: 0, scale: 0.85 },
            show: { opacity: 1, scale: 1 }
          }}
          transition={{ duration: 0.22, ease: [0.2, 1, 0.2, 1] }}
          className="grid size-11 place-items-center rounded-full text-xs font-semibold ring-2 ring-card"
          style={avatarStyle(name)}
        >
          {initialsOf(name)}
        </motion.span>
      ))}
    </motion.div>
  );
}

function PositionBand({
  groups,
  currencies
}: {
  groups: Group[];
  currencies: string[];
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const singleCurrency = currencies.length === 1 ? (currencies[0] ?? null) : null;

  if (!singleCurrency) {
    return (
      <section className="rounded-3xl bg-card p-6 shadow-soft sm:p-8">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.yourBalance")}
        </p>
        <ul className="mt-4 space-y-3">
          {currencyTotals(groups).map(({ code, total }) => (
            <li
              key={code}
              className="flex items-center justify-between gap-6 rounded-2xl bg-muted px-4 py-3"
            >
              <span className="text-xs font-semibold text-muted-foreground">
                {code}
              </span>
              <span
                className={cn(
                  "money text-xl font-medium",
                  total > 0
                    ? "text-positive"
                    : total < 0
                      ? "text-negative"
                      : "text-foreground"
                )}
              >
                {formatSignedMoney(total, code)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          {t("dashboard.mixedCurrencies")}
        </p>
      </section>
    );
  }

  const owedToYou = groups
    .filter((group) => (group.your_net ?? 0) > 0)
    .reduce((sum, group) => sum + (group.your_net ?? 0), 0);
  const youOwe = groups
    .filter((group) => (group.your_net ?? 0) < 0)
    .reduce((sum, group) => sum + -(group.your_net ?? 0), 0);
  const net = owedToYou - youOwe;

  return (
    <section className="rounded-3xl bg-card p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.yourBalance")}
          </p>
          <motion.p
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 1, 0.2, 1] }}
            className={cn(
              "mt-2 font-display text-6xl leading-none font-extrabold tracking-tight sm:text-7xl",
              net > 0
                ? "text-positive"
                : net < 0
                  ? "text-negative"
                  : "text-foreground"
            )}
          >
            {formatMoney(net, singleCurrency)}
          </motion.p>
        </div>
        <AvatarCluster groups={groups} />
      </div>

      {owedToYou === 0 && youOwe === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("balances.settled")}
        </p>
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-accent px-4 py-3">
            <p className="text-xs font-semibold text-accent-foreground/75">
              {t("dashboard.youOwe")}
            </p>
            <p className="money mt-1 text-lg font-medium text-accent-foreground">
              {formatMoney(youOwe, singleCurrency)}
            </p>
          </div>
          <div className="rounded-2xl bg-positive/12 px-4 py-3">
            <p className="text-xs font-semibold text-positive/75">
              {t("dashboard.owedToYou")}
            </p>
            <p className="money mt-1 text-lg font-medium text-positive">
              {formatMoney(owedToYou, singleCurrency)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await api.listGroups());
    } catch (err) {
      toast.error(errorMessage(err, t));
      setGroups([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loaded = groups ?? [];
  const currencies = [...new Set(loaded.map((group) => group.currency))];

  return (
    <div className="animate-fade space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            {t("dashboard.greeting", {
              name: (user?.name ?? "").split(" ")[0] ?? ""
            })}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link
            to={
              loaded.length > 0
                ? `/groups/${loaded[0]?.id}?tab=expenses&new=1`
                : "/groups?new=1"
            }
          >
            <Plus />{" "}
            {loaded.length > 0
              ? t("dashboard.newExpense")
              : t("groups.new")}
          </Link>
        </Button>
      </header>

      {groups === null ? (
        <div className="space-y-8">
          <Skeleton className="h-48 rounded-3xl" />
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("groups.emptyTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("groups.emptyDescription")}
            </p>
            <Button asChild className="mt-2 rounded-xl">
              <Link to="/groups?new=1">
                <Plus /> {t("groups.new")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <PositionBand groups={loaded} currencies={currencies} />

          <section>
            <ul className="space-y-3">
              {loaded.map((group) => {
                const memberCount = group.member_count ?? 0;
                return (
                  <li
                    key={group.id}
                    className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5 shadow-soft transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                  >
                    <Link
                      to={`/groups/${group.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold"
                        style={avatarStyle(group.name)}
                      >
                        {initialsOf(group.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {group.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {memberCount === 1
                            ? t("groups.memberOne", { count: memberCount })
                            : t("groups.memberMany", { count: memberCount })}
                          {" · "}
                          {group.currency}
                        </span>
                      </span>
                    </Link>
                    <NetValue
                      pill
                      net={group.your_net ?? 0}
                      currency={group.currency}
                    />
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground"
                    >
                      <Link
                        to={`/groups/${group.id}?tab=expenses&new=1`}
                        aria-label={t("dashboard.addExpenseAria", {
                          name: group.name
                        })}
                        title={t("expenseDialog.title")}
                      >
                        <Plus />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
