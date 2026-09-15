import { useState } from "react";
import {
  api,
  ApiError,
  type SettlementRecord,
  type SettlementTransaction
} from "../api";
import { formatMoney } from "../money";

export function SettlementPanel({
  groupId,
  currency,
  transactions,
  history,
  onChanged
}: {
  groupId: string;
  currency: string;
  transactions: SettlementTransaction[];
  history: SettlementRecord[];
  onChanged: () => void;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markAsPaid = async (transaction: SettlementTransaction) => {
    const key = `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`;
    setError(null);
    setPendingKey(key);
    try {
      await api.recordSettlement(groupId, {
        fromUserId: transaction.from_user_id,
        toUserId: transaction.to_user_id,
        amount: transaction.amount
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setPendingKey(null);
    }
  };

  const undo = async (record: SettlementRecord) => {
    setError(null);
    setPendingUndoId(record.id);
    try {
      await api.deleteSettlement(groupId, record.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to undo payment");
    } finally {
      setPendingUndoId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Suggested settlement
      </h2>

      {transactions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Everyone is settled up.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {transactions.map((transaction) => {
            const key = `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">
                    {transaction.from_name}
                  </span>
                  {" → "}
                  <span className="font-medium text-slate-900">
                    {transaction.to_name}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-900">
                    {formatMoney(transaction.amount, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void markAsPaid(transaction)}
                    disabled={pendingKey === key}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Mark as paid
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <h3 className="mt-6 text-sm font-semibold text-slate-900">
        Settlement history
      </h3>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No payments recorded yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {history.map((record) => (
            <li
              key={record.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">
                  {record.from_name}
                </span>
                {" → "}
                <span className="font-medium text-slate-900">
                  {record.to_name}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium text-slate-900">
                  {formatMoney(record.amount, currency)}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Paid
                </span>
                <button
                  type="button"
                  onClick={() => void undo(record)}
                  disabled={pendingUndoId === record.id}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  Undo
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
