import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Group } from "../api";

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
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api.listGroups());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load groups");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createGroup(name, currency);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Your groups</h1>
        <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New group name, e.g. Lisbon Trip"
            required
            className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Create group
          </button>
        </form>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {groups === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          No groups yet. Create one to get started.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                to={`/groups/${group.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
              >
                <span className="font-medium text-slate-900">{group.name}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {group.member_count ?? 0} member
                  {(group.member_count ?? 0) === 1 ? "" : "s"} · {group.currency}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
