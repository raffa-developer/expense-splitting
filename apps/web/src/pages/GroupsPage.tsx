import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Plus, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type Group } from "@/api";
import { AnimatedMoney } from "@/components/animated-money";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { errorMessage, useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

const BalanceByGroupChart = lazy(() =>
  import("@/components/balance-by-group-chart").then((module) => ({
    default: module.BalanceByGroupChart
  }))
);

const currencies = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CAD",
  "AUD",
  "JPY"
];

function NetBadge({ net, currency }: { net: number; currency: string }) {
  const { t } = useI18n();

  if (net === 0) {
    return <Badge variant="secondary">{t("balances.settled")}</Badge>;
  }
  if (net > 0) {
    return (
      <Badge variant="outline" className="border-positive/40 text-positive">
        {t("balances.getsBack", { amount: formatMoney(net, currency) })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-negative/40 text-negative">
      {t("balances.owes", { amount: formatMoney(-net, currency) })}
    </Badge>
  );
}

export function GroupsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api.listGroups());
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createGroup(name, currency);
      toast.success(t("groups.created"));
      setOpen(false);
      setName("");
      await load();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const loadedGroups = groups ?? [];
  const distinctCurrencies = [
    ...new Set(loadedGroups.map((group) => group.currency))
  ];
  const singleCurrency =
    distinctCurrencies.length === 1 ? (distinctCurrencies[0] ?? null) : null;
  const owedToYou = loadedGroups
    .filter((group) => (group.your_net ?? 0) > 0)
    .reduce((sum, group) => sum + (group.your_net ?? 0), 0);
  const youOwe = loadedGroups
    .filter((group) => (group.your_net ?? 0) < 0)
    .reduce((sum, group) => sum + -(group.your_net ?? 0), 0);

  return (
    <div className="space-y-8">
      <header className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("dashboard.greeting", { name: user?.name ?? "" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> {t("groups.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>{t("groups.new")}</DialogTitle>
                <DialogDescription>
                  {t("groups.dialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">{t("groups.name")}</Label>
                  <Input
                    id="group-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("groups.namePlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("groups.currency")}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("common.creating") : t("groups.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {groups === null ? (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <Card className="animate-rise border-border/70">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("groups.emptyTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("groups.emptyDescription")}
            </p>
            <Button className="mt-2" onClick={() => setOpen(true)}>
              <Plus /> {t("groups.new")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t("dashboard.owedToYou")}
              tone="positive"
              icon={<TrendingUp className="size-4" />}
              value={
                singleCurrency ? (
                  <AnimatedMoney minorUnits={owedToYou} currency={singleCurrency} />
                ) : (
                  "—"
                )
              }
              sub={
                singleCurrency ? undefined : t("dashboard.mixedCurrencies")
              }
            />
            <StatCard
              label={t("dashboard.youOwe")}
              tone="negative"
              icon={<TrendingDown className="size-4" />}
              delay={60}
              value={
                singleCurrency ? (
                  <AnimatedMoney minorUnits={youOwe} currency={singleCurrency} />
                ) : (
                  "—"
                )
              }
            />
            <StatCard
              label={t("dashboard.groupsCount")}
              icon={<Users className="size-4" />}
              delay={120}
              value={String(groups.length)}
              sub={`${singleCurrency ?? distinctCurrencies.join(" · ")}`}
            />
          </div>

          {singleCurrency && (
            <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
              <BalanceByGroupChart
                groups={groups}
                currency={singleCurrency}
              />
            </Suspense>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group, index) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="group animate-rise"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Card className="h-full border-border/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <CardContent className="flex items-center gap-3 py-5">
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold"
                      style={avatarStyle(group.name)}
                    >
                      {initialsOf(group.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{group.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(group.member_count ?? 0) === 1
                          ? t("groups.memberOne", {
                              count: group.member_count ?? 0
                            })
                          : t("groups.memberMany", {
                              count: group.member_count ?? 0
                            })}{" "}
                        · {group.currency}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <NetBadge
                        net={group.your_net ?? 0}
                        currency={group.currency}
                      />
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
