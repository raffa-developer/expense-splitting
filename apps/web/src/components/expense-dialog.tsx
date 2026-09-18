import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type CreateExpensePayload,
  type Expense,
  type GroupDetail,
  type SplitType
} from "@/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { errorMessage, useI18n, type MessageKey } from "@/lib/i18n";
import { toMinorUnits } from "@/money";

const splitTypeKeys: Record<SplitType, MessageKey> = {
  equal: "expenseDialog.splitEqual",
  exact: "expenseDialog.splitExact",
  percentage: "expenseDialog.splitPercentage",
  shares: "expenseDialog.splitShares"
};

function prefilledValues(expense?: Expense): Record<string, string> {
  if (!expense) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const participant of expense.participants) {
    if (expense.split_type === "exact") {
      map[participant.user_id] = String(participant.share / 100);
    } else if (expense.split_type === "percentage") {
      map[participant.user_id] =
        participant.percentage !== null && participant.percentage !== undefined
          ? String(participant.percentage)
          : "";
    } else if (expense.split_type === "shares") {
      map[participant.user_id] =
        participant.weight !== null && participant.weight !== undefined
          ? String(participant.weight)
          : "";
    }
  }
  return map;
}

export function ExpenseDialog({
  group,
  onCreated,
  onUpdated,
  expense,
  open: openProp,
  onOpenChange
}: {
  group: GroupDetail;
  onCreated?: () => void;
  onUpdated?: () => void;
  expense?: Expense;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) {
      onOpenChange(next);
    } else {
      setInternalOpen(next);
    }
  };
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(
    expense ? String(expense.amount / 100) : ""
  );
  const [paidBy, setPaidBy] = useState(
    expense?.paid_by ?? group.members[0]?.id ?? ""
  );
  const [splitType, setSplitType] = useState<SplitType>(
    expense?.split_type ?? "equal"
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    expense
      ? expense.participants.map((participant) => participant.user_id)
      : group.members.map((member) => member.id)
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    prefilledValues(expense)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDescription(expense?.description ?? "");
    setAmount(expense ? String(expense.amount / 100) : "");
    setPaidBy(expense?.paid_by ?? group.members[0]?.id ?? "");
    setSplitType(expense?.split_type ?? "equal");
    setParticipantIds(
      expense
        ? expense.participants.map((participant) => participant.user_id)
        : group.members.map((member) => member.id)
    );
    setValues(prefilledValues(expense));
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      reset();
    }
    setOpen(next);
  };

  const toggleParticipant = (userId: string) => {
    setParticipantIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId]
    );
  };

  const setValue = (userId: string, value: string) => {
    setValues((previous) => ({ ...previous, [userId]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const amountMinor = toMinorUnits(amount);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError(t("expenseDialog.errorAmount"));
      return;
    }
    if (participantIds.length === 0) {
      setError(t("expenseDialog.errorParticipants"));
      return;
    }

    const participants: CreateExpensePayload["participants"] =
      participantIds.map((userId) => {
        if (splitType === "exact") {
          return {
            userId,
            share: toMinorUnits(values[userId]?.trim() || "0")
          };
        }
        if (splitType === "percentage") {
          return { userId, percentage: Number(values[userId]?.trim() || "0") };
        }
        if (splitType === "shares") {
          return { userId, weight: Number(values[userId]?.trim() || "0") };
        }
        return { userId };
      });

    if (
      splitType === "exact" &&
      participants.some(
        (participant) =>
          !Number.isInteger(participant.share) || (participant.share ?? 0) < 0
      )
    ) {
      setError(t("expenseDialog.errorExact"));
      return;
    }

    const payload: CreateExpensePayload = {
      description,
      amount: amountMinor,
      paidBy,
      splitType,
      participants
    };

    setSubmitting(true);
    try {
      if (expense) {
        await api.updateExpense(group.id, expense.id, payload);
        toast.success(t("expenseDialog.updated"));
      } else {
        await api.createExpense(group.id, payload);
        toast.success(t("expenseDialog.added"));
      }
      setOpen(false);
      if (expense) {
        onUpdated?.();
      } else {
        onCreated?.();
      }
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const valueLabel =
    splitType === "exact"
      ? group.currency
      : splitType === "percentage"
        ? "%"
        : splitType === "shares"
          ? t("expenseDialog.splitShares")
          : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!expense && (
        <DialogTrigger asChild>
          <Button>
            <Plus /> {t("expenseDialog.title")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {expense ? t("expenseDialog.editTitle") : t("expenseDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {expense
                ? t("expenseDialog.editDescription")
                : t("expenseDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="expense-description">
                {t("expenseDialog.what")}
              </Label>
              <Input
                id="expense-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("expenseDialog.whatPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">
                {t("expenseDialog.amount", { currency: group.currency })}
              </Label>
              <Input
                id="expense-amount"
                className="money"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={t("expenseDialog.amountPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("expenseDialog.paidBy")}</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {group.members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("expenseDialog.split")}</Label>
              <Select
                value={splitType}
                onValueChange={(value) => setSplitType(value as SplitType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(splitTypeKeys) as [SplitType, MessageKey][]
                  ).map(([value, key]) => (
                    <SelectItem key={value} value={value}>
                      {t(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t("expenseDialog.participants")}</Label>
            <ul className="space-y-1">
              {group.members.map((member) => {
                const selected = participantIds.includes(member.id);
                return (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleParticipant(member.id)}
                      />
                      {member.name}
                    </label>
                    {splitType !== "equal" && selected && (
                      <div className="flex items-center gap-2">
                        <span className="max-w-24 truncate text-xs text-muted-foreground">
                          {valueLabel}
                        </span>
                        <Input
                          className="h-8 w-24"
                          inputMode="decimal"
                          value={values[member.id] ?? ""}
                          onChange={(event) =>
                            setValue(member.id, event.target.value)
                          }
                          placeholder="0"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {splitType === "exact" && (
              <p className="text-xs text-muted-foreground">
                {t("expenseDialog.hintExact", { currency: group.currency })}
              </p>
            )}
            {splitType === "percentage" && (
              <p className="text-xs text-muted-foreground">
                {t("expenseDialog.hintPercentage")}
              </p>
            )}
            {splitType === "shares" && (
              <p className="text-xs text-muted-foreground">
                {t("expenseDialog.hintShares")}
              </p>
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
                : expense
                  ? t("common.save")
                  : t("expenseDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
