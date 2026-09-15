import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type Group } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("groups.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("groups.subtitle")}</p>
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
      </div>

      {groups === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-medium">{t("groups.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("groups.emptyDescription")}
            </p>
            <Button onClick={() => setOpen(true)}>
              <Plus /> {t("groups.new")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="group">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between gap-3 py-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{group.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(group.member_count ?? 0) === 1
                        ? t("groups.memberOne", { count: group.member_count ?? 0 })
                        : t("groups.memberMany", {
                            count: group.member_count ?? 0
                          })}{" "}
                      · {group.currency}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
