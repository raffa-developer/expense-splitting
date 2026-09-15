import { useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  type CreateExpensePayload,
  type GroupDetail,
  type SplitType
} from "../api";
import { formatMoney, toMinorUnits } from "../money";

const splitTypes: { value: SplitType; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Exact" },
  { value: "percentage", label: "Percentage" },
  { value: "shares", label: "Shares" }
];

export function AddExpenseForm({
  group,
  onCreated,
  onCancel
}: {
  group: GroupDetail;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(group.members[0]?.id ?? "");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [participantIds, setParticipantIds] = useState<string[]>(
    group.members.map((member) => member.id)
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError("Enter a valid amount, for example 120.50.");
      return;
    }
    if (participantIds.length === 0) {
      setError("Select at least one participant.");
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
      setError("Enter a valid amount for every participant.");
      return;
    }

    setSubmitting(true);
    try {
      await api.createExpense(group.id, {
        description,
        amount: amountMinor,
        paidBy,
        splitType,
        participants
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const valueLabel =
    splitType === "exact"
      ? `Amount in ${group.currency}`
      : splitType === "percentage"
        ? "Percentage"
        : "Weight";

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-base font-semibold text-slate-900">Add expense</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">Description</span>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="120.00"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Paid by</span>
          <select
            value={paidBy}
            onChange={(event) => setPaidBy(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600">Split</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {splitTypes.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-1.5 text-sm text-slate-700"
              >
                <input
                  type="radio"
                  name="splitType"
                  value={option.value}
                  checked={splitType === option.value}
                  onChange={() => setSplitType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div>
        <span className="text-xs font-medium text-slate-600">Participants</span>
        <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200">
          {group.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <label className="flex flex-1 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={participantIds.includes(member.id)}
                  onChange={() => toggleParticipant(member.id)}
                />
                {member.name}
              </label>
              {splitType !== "equal" && participantIds.includes(member.id) && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  {valueLabel}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[member.id] ?? ""}
                    onChange={(event) => setValue(member.id, event.target.value)}
                    placeholder="0"
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Save expense
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-slate-400">
          Total: {amountMinorOrDash(amount, group.currency)}
        </span>
      </div>
    </form>
  );
}

function amountMinorOrDash(amount: string, currency: string): string {
  const minorUnits = toMinorUnits(amount);
  if (!Number.isInteger(minorUnits)) {
    return "—";
  }
  return formatMoney(minorUnits, currency);
}
