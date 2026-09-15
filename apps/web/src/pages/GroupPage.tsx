import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type BalancesResponse,
  type Expense,
  type GroupDetail,
  type SettlementRecord,
  type SettlementResponse,
  type User
} from "../api";
import { AddExpenseForm } from "../components/AddExpenseForm";
import { SettlementPanel } from "../components/SettlementPanel";
import { formatMoney, formatSignedMoney } from "../money";

const PAGE_SIZE = 50;

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
  const navigate = useNavigate();
  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<User[] | null>(null);
  const [searchingMembers, setSearchingMembers] = useState(false);

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
      setError(err instanceof ApiError ? err.message : "Failed to load group");
    }
  }, [groupId]);

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
      setError(err instanceof ApiError ? err.message : "Failed to load expenses");
    } finally {
      setLoadingMore(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      await api.deleteExpense(groupId, expenseId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete expense");
    }
  };

  const deleteGroup = async () => {
    if (!state) {
      return;
    }
    if (!window.confirm(`Delete "${state.group.name}" and all of its data?`)) {
      return;
    }
    try {
      await api.deleteGroup(groupId);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete group");
    }
  };

  const searchMembers = async (event: FormEvent) => {
    event.preventDefault();
    setSearchingMembers(true);
    setError(null);
    try {
      const results = await api.searchUsers(memberQuery);
      const memberIds = new Set(
        state?.group.members.map((member) => member.id) ?? []
      );
      setMemberResults(results.filter((user) => !memberIds.has(user.id)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to search users");
    } finally {
      setSearchingMembers(false);
    }
  };

  const addMember = async (userId: string) => {
    try {
      await api.addMember(groupId, userId);
      setMemberQuery("");
      setMemberResults(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add member");
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await api.removeMember(groupId, userId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <Link to="/" className="text-sm text-slate-600 underline">
          Back to groups
        </Link>
      </div>
    );
  }

  if (!state) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const { group, expenses, expensesTotal, balances, settlement, history } =
    state;
  const currency = group.currency;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">
              ← All groups
            </Link>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              {group.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Total spent:{" "}
              <span className="font-medium text-slate-900">
                {formatMoney(balances.total, currency)}
              </span>{" "}
              · {currency}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void deleteGroup()}
              className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete group
            </button>
            <button
              type="button"
              onClick={() => setShowAddExpense((previous) => !previous)}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              {showAddExpense ? "Close" : "Add expense"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <span className="text-xs font-medium text-slate-600">Members</span>
          <ul className="mt-1 flex flex-wrap gap-2">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {member.name}
                <button
                  type="button"
                  onClick={() => void removeMember(member.id)}
                  title={`Remove ${member.name}`}
                  className="text-slate-400 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={searchMembers} className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Find a person by email…"
              required
              minLength={3}
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={searchingMembers}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Search
            </button>
          </form>

          {memberResults !== null && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
              {memberResults.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  No matching users found.
                </li>
              ) : (
                memberResults.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-sm text-slate-700">
                      {user.name}{" "}
                      <span className="text-slate-400">({user.email})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void addMember(user.id)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Add
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </section>

      {showAddExpense && (
        <AddExpenseForm
          group={group}
          onCreated={() => {
            setShowAddExpense(false);
            void load();
          }}
          onCancel={() => setShowAddExpense(false)}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Balances</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Member</th>
              <th className="py-2 text-right font-medium">Paid</th>
              <th className="py-2 text-right font-medium">Owed</th>
              <th className="py-2 text-right font-medium">Settled</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.balances.map((balance) => (
              <tr key={balance.user_id} className="border-b border-slate-100">
                <td className="py-2 font-medium text-slate-900">
                  {balance.name}
                </td>
                <td className="py-2 text-right text-slate-600">
                  {formatMoney(balance.paid, currency)}
                </td>
                <td className="py-2 text-right text-slate-600">
                  {formatMoney(balance.owed, currency)}
                </td>
                <td className="py-2 text-right text-slate-600">
                  {formatSignedMoney(balance.settled, currency)}
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    balance.balance > 0
                      ? "text-emerald-600"
                      : balance.balance < 0
                        ? "text-red-600"
                        : "text-slate-500"
                  }`}
                >
                  {formatSignedMoney(balance.balance, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SettlementPanel
        groupId={group.id}
        currency={currency}
        transactions={settlement.transactions}
        history={history}
        onChanged={() => void load()}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Expenses</h2>
          {expensesTotal > 0 && (
            <span className="text-xs text-slate-500">
              Showing {expenses.length} of {expensesTotal}
            </span>
          )}
        </div>
        {expenses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No expenses yet. Add the first one.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-slate-100">
              {expenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {expense.description}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Paid by {expense.paid_by_name} · {expense.split_type} ·{" "}
                      {expense.participants.length} participant
                      {expense.participants.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900">
                      {formatMoney(expense.amount, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteExpense(expense.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {expenses.length < expensesTotal && (
              <button
                type="button"
                onClick={() => void loadMoreExpenses()}
                disabled={loadingMore}
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {loadingMore
                  ? "Loading…"
                  : `Load more (${expensesTotal - expenses.length} remaining)`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
