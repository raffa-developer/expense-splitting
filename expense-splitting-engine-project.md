# Project 9 — Expense Splitting Engine

## The idea

Build a lightweight Splitwise-style application, but focus on the **expense and debt-settlement engine**, not a giant social app.

The UI can stay simple. The interesting part is the backend logic.

A group of people creates a trip/group:

```text
Lisbon Trip

Members:
- Alex
- Bruno
- Carla
- David
```

Then people add expenses:

```text
Alex paid €120 for dinner
Bruno paid €80 for hotel
Carla paid €40 for taxi
```

The system calculates how much everyone actually owes.

Example:

```text
Total spent: €240
4 people
────────────────
Each person should pay: €60
```

Current balances:

```text
Alex     paid €120 → +€60
Bruno    paid €80  → +€20
Carla    paid €40  → -€20
David    paid €0   → -€60
```

The system then generates settlements:

```text
David  → Alex    €60
Carla  → Bruno   €20
```

Now everyone is even.

---

# 1. Settlement optimization

This is where the project becomes more than CRUD.

Suppose:

```text
Alice   +€100
Bob      +€50
Carlos   -€80
Diana    -€70
```

A naïve system could produce:

```text
Carlos → Alice   €80
Diana  → Alice   €20
Diana  → Bob     €50
```

Your algorithm should attempt to minimize the number of transfers.

The general problem:

```text
People who are owed money
        +
People who owe money
        ↓
Settlement algorithm
        ↓
Minimum / near-minimum transfers
```

One simple strategy is to repeatedly match the largest debtor with the largest creditor.

You can later investigate more advanced approaches to minimize transfers.

This algorithm should be one of the main things you highlight in your portfolio.

---

# 2. Data model

Keep the initial schema relatively small.

## users

```text
id
name
email
created_at
```

## groups

```text
id
name
created_at
```

## group_members

```text
group_id
user_id
joined_at
```

## expenses

```text
id
group_id
description
amount
paid_by
created_at
```

## expense_participants

```text
expense_id
user_id
share
```

The important concept is that **who paid** and **who owes** are independent.

Example:

```text
Dinner: €100

Paid by: Alex

Participants:
Alex    €25
Bruno   €25
Carla   €25
David   €25
```

Alex paid €100 but is ultimately responsible for only €25.

---

# 3. Split types

Support several ways to split an expense.

## Equal split

```text
€100 / 4 people

Everyone → €25
```

## Exact amounts

```text
Alex   €40
Bruno  €30
Carla  €20
David  €10
```

The backend must validate:

```text
exact shares = expense amount
```

## Percentage

```text
Alex   50%
Bruno  30%
Carla  20%
```

The backend must validate:

```text
percentages = 100%
```

Do not rely on the frontend for these validations.

---

# 4. API design

Example endpoints:

```http
POST /api/groups
GET  /api/groups/:id
POST /api/groups/:id/members
```

Expenses:

```http
POST /api/groups/:id/expenses
GET  /api/groups/:id/expenses
GET  /api/groups/:id/expenses/:expenseId
DELETE /api/groups/:id/expenses/:expenseId
```

Balance and settlement:

```http
GET /api/groups/:id/balances
GET /api/groups/:id/settlement
```

Example:

```http
GET /api/groups/123/settlement
```

Response:

```json
{
  "transactions": [
    {
      "from": "David",
      "to": "Alex",
      "amount": 60
    },
    {
      "from": "Carla",
      "to": "Bruno",
      "amount": 20
    }
  ]
}
```

---

# 5. Balance calculation

For every user:

```text
balance = amount_paid - amount_owed
```

Example:

```text
Alex     +60
Bruno    +20
Carla    -20
David    -60
```

Positive balance means the person should receive money.

Negative balance means the person owes money.

Then separate them:

```text
Creditors:

Alex    +60
Bruno   +20


Debtors:

Carla   -20
David   -60
```

Match debtors with creditors.

Result:

```text
Carla → Bruno €20
David → Alex  €60
```

---

# 6. Database transactions

When adding an expense:

1. Validate the group.
2. Validate all participants.
3. Validate the split.
4. Create the expense.
5. Create all participant shares.

These should happen atomically:

```text
BEGIN TRANSACTION

Create expense
      ↓
Create participant 1
      ↓
Create participant 2
      ↓
Create participant 3
      ↓
COMMIT
```

If anything fails:

```text
ROLLBACK
```

You don't want an expense to exist with only some participant records saved.

---

# 7. Idempotency

Support idempotency to make the backend robust.

Imagine a user submits:

```http
POST /expenses
```

The request succeeds, but their connection fails before they receive the response.

They press "Submit" again.

Without protection:

```text
€50 Dinner
€50 Dinner
```

Support an idempotency key:

```http
Idempotency-Key: 8f72a1...
```

The backend stores the result associated with that key.

If the same request is received again:

```text
same idempotency key
        ↓
already processed
        ↓
return original result
```

---

# 8. Money and currency

Initially, support **one currency per group**.

When storing money, avoid floating-point values.

Prefer integer minor units:

```text
€10.50 → 1050
€100.00 → 10000
```

Example:

```text
amount = 1050
currency = EUR
```

This avoids common floating-point errors when dealing with money.

---

# 9. Settlement history

Once someone actually pays a debt, record it.

## settlements

```text
id
group_id
from_user
to_user
amount
created_at
```

Example:

```text
David paid Alex €60
```

Display:

```text
Settlement history

David → Alex       €60    Paid
Carla → Bruno      €20    Paid
Alex  → Bruno      €15    Paid
```

---

# 10. Frontend

Keep it simple.

## Group page

```text
Lisbon Trip
────────────────────────

Total expenses       €840

Members
Alex
Bruno
Carla
David

[ Add expense ]

────────────────────────

Balances

Alex       +€120
Bruno       +€40
Carla       -€70
David       -€90

[ View settlement ]
```

## Add expense

```text
Add Expense

Description
[ Dinner ]

Amount
[ €120 ]

Paid by
[ Alex ▼ ]

Split
○ Equal
○ Exact
○ Percentage

Participants

☑ Alex
☑ Bruno
☑ Carla
☑ David

[ Add Expense ]
```

## Settlement

```text
Suggested settlement

David → Alex      €90
Carla → Alex      €30
Carla → Bruno     €40

[ Mark as paid ]
```

---

# 11. Architecture

A simple architecture is enough:

```text
                Next.js
                   │
                   ▼
              REST API
                   │
                   ▼
              PostgreSQL
                   │
                   ▼
            Settlement Engine
                   │
                   ▼
             Calculated debts
```

You probably do **not** need Redis initially.

Unlike the URL shortener, the interesting part of this project is domain logic and database consistency rather than caching.

---

# 12. Testing

Test the settlement engine heavily.

Example:

```text
Input:

A +100
B +50
C -80
D -70

Expected:

C → A €80
D → A €20
D → B €50
```

Test edge cases:

```text
Everyone paid equally
One person paid everything
Only two people
Many participants
€0 expense
Invalid split
Rounding
Large number of members
Multiple expenses
Already-settled debts
```

Especially test money rounding.

---

# 13. Performance challenge

After the basic version works, create benchmarks.

For example:

```text
10 people
100 expenses
```

Then:

```text
50 people
1,000 expenses
```

Then:

```text
1,000 people
100,000 expenses
```

Measure:

```text
Number of expenses
Number of users
Calculation time
Database query count
```

Then optimize your implementation.

A strong portfolio story would be:

> "I originally calculated balances by loading every expense into memory. I changed the design to maintain aggregated balances, reducing settlement calculation time from X to Y."

Use your own benchmark numbers rather than inventing them.

---

# 14. Development roadmap

## V1 — Groups

- Create group
- Add/remove members
- View members

## V2 — Expenses

- Create expense
- Equal split
- Exact split
- Delete expense

## V3 — Balance engine

Calculate:

```text
paid - owed = balance
```

## V4 — Settlement algorithm

Convert:

```text
balances
```

into:

```text
A → B €50
C → A €20
```

## V5 — Better splitting

Add:

- Percentages
- Custom shares
- Validation
- Rounding

## V6 — Settlement tracking

- Mark payment as completed
- Settlement history
- Remaining balance

## V7 — Production quality

- Authentication
- Authorization
- Idempotency
- Database transactions
- Tests
- API documentation
- Docker
- Logging
- Error handling

---

# 15. Portfolio positioning

Don't describe it simply as:

> "I built a Splitwise clone."

A stronger description is:

> **"An expense settlement engine that calculates participant balances and generates optimized debt settlements while maintaining transactional consistency."**

The project pipeline is:

```text
Expenses
    ↓
Validation
    ↓
Balance calculation
    ↓
Debt graph
    ↓
Settlement optimization
    ↓
Transactions
    ↓
Settlement history
```

---

# 16. Suggested stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS

## Backend

- Node.js
- TypeScript
- Fastify or Express

## Database

- PostgreSQL

## Infrastructure

- Docker
- Docker Compose

## Testing

- Vitest
- Integration tests

You can add Redis later if you find a real use for it.
