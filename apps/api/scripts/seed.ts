const API_URL = process.env.SEED_API_URL ?? "http://localhost:3000";
const PASSWORD = "password123";
const GROUP_NAME = "Lisbon Trip";

interface ApiUser {
  id: string;
  name: string;
  email: string;
}

interface ApiGroup {
  id: string;
  name: string;
}

interface AuthResponse {
  user: ApiUser;
  token: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
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
  return { status: response.status, data: data as T };
}

async function ensureUser(
  name: string,
  email: string
): Promise<{ user: ApiUser; token: string }> {
  const register = await request<AuthResponse>("POST", "/api/auth/register", {
    name,
    email,
    password: PASSWORD
  });
  if (register.status === 201) {
    return register.data;
  }

  if (register.status === 409) {
    const login = await request<AuthResponse>("POST", "/api/auth/login", {
      email,
      password: PASSWORD
    });
    if (login.status === 200) {
      return login.data;
    }
    throw new Error(`Failed to log in ${email}: ${login.status}`);
  }

  throw new Error(
    `Failed to register ${email}: ${register.status} ${JSON.stringify(register.data)}`
  );
}

async function addExpense(
  token: string,
  groupId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await request(
    "POST",
    `/api/groups/${groupId}/expenses`,
    payload,
    token
  );
  if (response.status !== 201) {
    throw new Error(
      `Failed to add expense: ${response.status} ${JSON.stringify(response.data)}`
    );
  }
}

async function main(): Promise<void> {
  const alex = await ensureUser("Nuno Liu", "alex@demo.local");
  const bruno = await ensureUser("Osvaldo", "bruno@demo.local");
  const carla = await ensureUser("Carla", "carla@demo.local");
  const david = await ensureUser("David", "david@demo.local");
  const everyone = [alex.user.id, bruno.user.id, carla.user.id, david.user.id];

  const existingGroups = await request<ApiGroup[]>(
    "GET",
    "/api/groups",
    undefined,
    alex.token
  );
  const existing = existingGroups.data.find((group) => group.name === GROUP_NAME);
  if (existing) {
    await request("DELETE", `/api/groups/${existing.id}`, undefined, alex.token);
    console.log(`Removed previous "${GROUP_NAME}" group`);
  }

  const created = await request<ApiGroup>(
    "POST",
    "/api/groups",
    { name: GROUP_NAME, currency: "EUR" },
    alex.token
  );
  if (created.status !== 201) {
    throw new Error(`Failed to create group: ${created.status}`);
  }
  const groupId = created.data.id;

  for (const user of [bruno, carla, david]) {
    await request(
      "POST",
      `/api/groups/${groupId}/members`,
      { userId: user.user.id },
      alex.token
    );
  }

  await addExpense(alex.token, groupId, {
    description: "Dinner",
    amount: 12000,
    paidBy: alex.user.id,
    splitType: "equal",
    participants: everyone.map((userId) => ({ userId }))
  });

  await addExpense(alex.token, groupId, {
    description: "Hotel",
    amount: 8000,
    paidBy: bruno.user.id,
    splitType: "exact",
    participants: [
      { userId: alex.user.id, share: 4000 },
      { userId: bruno.user.id, share: 2000 },
      { userId: carla.user.id, share: 1000 },
      { userId: david.user.id, share: 1000 }
    ]
  });

  await addExpense(alex.token, groupId, {
    description: "Taxi",
    amount: 100,
    paidBy: carla.user.id,
    splitType: "percentage",
    participants: [
      { userId: alex.user.id, percentage: 40 },
      { userId: bruno.user.id, percentage: 20 },
      { userId: carla.user.id, percentage: 20 },
      { userId: david.user.id, percentage: 20 }
    ]
  });

  await addExpense(alex.token, groupId, {
    description: "Groceries",
    amount: 1000,
    paidBy: david.user.id,
    splitType: "shares",
    participants: [
      { userId: alex.user.id, weight: 2 },
      { userId: bruno.user.id, weight: 1 },
      { userId: carla.user.id, weight: 1 },
      { userId: david.user.id, weight: 1 }
    ]
  });

  const settlement = await request(
    "POST",
    `/api/groups/${groupId}/settlements`,
    { fromUserId: bruno.user.id, toUserId: alex.user.id, amount: 500 },
    alex.token
  );
  if (settlement.status !== 201) {
    throw new Error(`Failed to record settlement: ${settlement.status}`);
  }

  const balances = await request<{ total: number }>(
    "GET",
    `/api/groups/${groupId}/balances`,
    undefined,
    alex.token
  );

  console.log("");
  console.log(`Seeded "${GROUP_NAME}" (${groupId})`);
  console.log(`Total spent: ${balances.data.total / 100} EUR`);
  console.log("");
  console.log("Demo users (password: password123):");
  console.log("  alex@demo.local");
  console.log("  bruno@demo.local");
  console.log("  carla@demo.local");
  console.log("  david@demo.local");
  console.log("");
  console.log(`Web app: ${process.env.SEED_WEB_URL ?? "http://localhost:8080"}`);
}

await main();
