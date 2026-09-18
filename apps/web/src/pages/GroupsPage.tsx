import {
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type Group } from "@/api";
import { notifyGroupsChanged } from "@/components/app-shell";
import { NetValue } from "@/components/net-value";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
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
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { errorMessage, useI18n } from "@/lib/i18n";

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

export function GroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createGroup(name, currency);
      toast.success(t("groups.created"));
      setOpen(false);
      setName("");
      notifyGroupsChanged();
      await load();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("groups.title")}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {t("groups.subtitle")}
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus /> {t("groups.new")}
        </Button>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
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

      {groups === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 rounded-2xl" />
          ))}
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
            <Button className="mt-2" onClick={() => setOpen(true)}>
              <Plus /> {t("groups.new")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const memberCount = group.member_count ?? 0;
            return (
              <li
                key={group.id}
                className="rounded-2xl bg-card shadow-soft transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                <Link
                  to={`/groups/${group.id}`}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold"
                    style={avatarStyle(group.name)}
                  >
                    {initialsOf(group.name)}
                  </span>
                  <span className="min-w-0 flex-1">
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
                  <NetValue
                    pill
                    net={group.your_net ?? 0}
                    currency={group.currency}
                  />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
