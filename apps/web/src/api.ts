export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  created_at: string;
  member_count?: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  joined_at: string;
}

export interface GroupDetail extends Group {
  members: Member[];
}

export interface ParticipantShare {
  user_id: string;
  name: string;
  share: number;
}

export type SplitType = "equal" | "exact" | "percentage" | "shares";

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  split_type: SplitType;
  paid_by: string;
  paid_by_name: string;
  created_at: string;
  participants: ParticipantShare[];
}

export interface ExpenseListResponse {
  expenses: Expense[];
  total: number;
  limit: number;
  offset: number;
}

export interface Balance {
  user_id: string;
  name: string;
  paid: number;
  owed: number;
  settled: number;
  balance: number;
}

export interface BalancesResponse {
  currency: string;
  total: number;
  balances: Balance[];
}

export interface SettlementTransaction {
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
}

export interface SettlementResponse {
  currency: string;
  transactions: SettlementTransaction[];
}

export interface SettlementRecord {
  id: string;
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount: number;
  created_at: string;
}

export interface CreateExpensePayload {
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  participants: {
    userId: string;
    share?: number;
    percentage?: number;
    weight?: number;
  }[];
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "expense-splitting-token";

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(value: string | null): void {
  token = value;
  if (value === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, value);
  }
}

export function getToken(): string | null {
  return token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)
      ?.error;
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("auth:logout"));
    }
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? `Request failed with status ${response.status}`
    );
  }

  return data as T;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<{ user: User; token: string }>("POST", "/api/auth/register", {
      name,
      email,
      password
    }),

  login: (email: string, password: string) =>
    request<{ user: User; token: string }>("POST", "/api/auth/login", {
      email,
      password
    }),

  me: () => request<{ user: User }>("GET", "/api/auth/me"),

  searchUsers: (email: string) =>
    request<User[]>("GET", `/api/users?email=${encodeURIComponent(email)}`),

  listGroups: () => request<Group[]>("GET", "/api/groups"),

  createGroup: (name: string, currency?: string) =>
    request<Group>(
      "POST",
      "/api/groups",
      currency ? { name, currency } : { name }
    ),

  deleteGroup: (groupId: string) =>
    request<null>("DELETE", `/api/groups/${groupId}`),

  addMember: (groupId: string, userId: string) =>
    request<Member>("POST", `/api/groups/${groupId}/members`, { userId }),

  removeMember: (groupId: string, userId: string) =>
    request<null>("DELETE", `/api/groups/${groupId}/members/${userId}`),

  getGroup: (groupId: string) =>
    request<GroupDetail>("GET", `/api/groups/${groupId}`),

  listExpenses: (
    groupId: string,
    options: { limit?: number; offset?: number } = {}
  ) =>
    request<ExpenseListResponse>(
      "GET",
      `/api/groups/${groupId}/expenses?limit=${options.limit ?? 50}&offset=${options.offset ?? 0}`
    ),

  createExpense: (groupId: string, payload: CreateExpensePayload) =>
    request<Expense>("POST", `/api/groups/${groupId}/expenses`, payload),

  createExpensesBatch: (
    groupId: string,
    payload: { expenses: CreateExpensePayload[] }
  ) =>
    request<{ expenses: Expense[] }>(
      "POST",
      `/api/groups/${groupId}/expenses/batch`,
      payload
    ),

  deleteExpense: (groupId: string, expenseId: string) =>
    request<null>("DELETE", `/api/groups/${groupId}/expenses/${expenseId}`),

  getBalances: (groupId: string) =>
    request<BalancesResponse>("GET", `/api/groups/${groupId}/balances`),

  getSettlement: (groupId: string) =>
    request<SettlementResponse>("GET", `/api/groups/${groupId}/settlement`),

  listSettlements: (groupId: string) =>
    request<SettlementRecord[]>("GET", `/api/groups/${groupId}/settlements`),

  deleteSettlement: (groupId: string, settlementId: string) =>
    request<null>(
      "DELETE",
      `/api/groups/${groupId}/settlements/${settlementId}`
    ),

  recordSettlement: (
    groupId: string,
    payload: { fromUserId: string; toUserId: string; amount: number }
  ) =>
    request<SettlementRecord>(
      "POST",
      `/api/groups/${groupId}/settlements`,
      payload
    )
};
