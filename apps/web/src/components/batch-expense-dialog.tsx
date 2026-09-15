import { useState, type FormEvent } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type GroupDetail } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { errorMessage, useI18n } from "@/lib/i18n";
import { formatMoney, toMinorUnits } from "@/money";

interface BatchItem {
  key: string;
  description: string;
  amount: string;
  paidBy: string;
}

function newItem(payerId: string): BatchItem {
  return {
    key: crypto.randomUUID(),
    description: "",
    amount: "",
    paidBy: payerId
  };
}

export function BatchExpenseDialog({
  group,
  onCreated
}: {
  group: GroupDetail;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const defaultPayer = group.members[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([newItem(defaultPayer)]);
  const [participantIds, setParticipantIds] = useState<string[]>(
    group.members.map((member) => member.id)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setItems([newItem(defaultPayer)]);
    setParticipantIds(group.members.map((member) => member.id));
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      reset();
    }
    setOpen(next);
  };

  const updateItem = (key: string, patch: Partial<Omit<BatchItem, "key">>) => {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const toggleParticipant = (userId: string) => {
    setParticipantIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId]
    );
  };

  const totalMinor = items.reduce((sum, item) => {
    const minorUnits = toMinorUnits(item.amount);
    return sum + (Number.isInteger(minorUnits) ? minorUnits : 0);
  }, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (participantIds.length === 0) {
      setError(t("batchDialog.errorParticipants"));
      return;
    }
    for (const [index, item] of items.entries()) {
      if (item.description.trim().length === 0) {
        setError(t("batchDialog.errorName", { index: index + 1 }));
        return;
      }
      const minorUnits = toMinorUnits(item.amount);
      if (!Number.isInteger(minorUnits) || minorUnits <= 0) {
        setError(t("batchDialog.errorAmount", { index: index + 1 }));
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.createExpensesBatch(group.id, {
        expenses: items.map((item) => ({
          description: item.description.trim(),
          amount: toMinorUnits(item.amount),
          paidBy: item.paidBy,
          splitType: "equal",
          participants: participantIds.map((userId) => ({ userId }))
        }))
      });
      toast.success(
        items.length === 1
          ? t("batchDialog.addedOne")
          : t("batchDialog.addedMany", { count: items.length })
      );
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Layers /> {t("batchDialog.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("batchDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("batchDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("batchDialog.whoWasThere")}</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {group.members.map((member) => (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={participantIds.includes(member.id)}
                    onCheckedChange={() => toggleParticipant(member.id)}
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t("batchDialog.items")}</Label>
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.key}
                  className="grid grid-cols-12 items-center gap-2"
                >
                  <Input
                    className="col-span-12 sm:col-span-5"
                    value={item.description}
                    onChange={(event) =>
                      updateItem(item.key, { description: event.target.value })
                    }
                    placeholder={t("batchDialog.itemDescriptionPlaceholder")}
                    aria-label={t("batchDialog.items")}
                  />
                  <Input
                    className="col-span-6 sm:col-span-3"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(event) =>
                      updateItem(item.key, { amount: event.target.value })
                    }
                    placeholder={t("batchDialog.itemAmountPlaceholder")}
                    aria-label={t("expenseDialog.amount", {
                      currency: group.currency
                    })}
                  />
                  <select
                    className="col-span-5 h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs dark:bg-input/30 sm:col-span-3"
                    value={item.paidBy}
                    onChange={(event) =>
                      updateItem(item.key, { paidBy: event.target.value })
                    }
                    aria-label={t("batchDialog.whoPaid")}
                  >
                    {group.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1 size-8 text-muted-foreground hover:text-destructive"
                    aria-label={t("batchDialog.removeItem")}
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((previous) =>
                        previous.filter((entry) => entry.key !== item.key)
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setItems((previous) => [...previous, newItem(defaultPayer)])
              }
            >
              <Plus /> {t("batchDialog.addItem")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {t("batchDialog.total")}{" "}
              <span className="font-medium text-foreground">
                {formatMoney(totalMinor, group.currency)}
              </span>
            </span>
            {participantIds.length > 0 && (
              <span className="text-muted-foreground">
                {t("batchDialog.eachPerson")}{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(
                    Math.round(totalMinor / participantIds.length),
                    group.currency
                  )}
                </span>
              </span>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("common.saving")
                : items.length === 1
                  ? t("batchDialog.submitOne")
                  : t("batchDialog.submitMany", { count: items.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
