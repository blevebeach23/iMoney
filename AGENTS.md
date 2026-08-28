# AGENTS.md

## Project authority

Before making architectural, database, security, or financial-logic changes, read `MASTER_PROMPT.md`.

`MASTER_PROMPT.md` is the primary functional and technical specification for this project.

If there is a conflict between an implementation detail and the rules defined in `MASTER_PROMPT.md`, preserve the business rules in `MASTER_PROMPT.md`.

Do not silently change financial behavior.

---

## Technology stack

Use the existing project stack:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Supabase
- PostgreSQL
- Supabase Auth
- PostgreSQL Row Level Security
- Recharts
- Zod

Keep TypeScript strict.

Avoid `any` unless there is a documented technical reason.

---

## Architecture rules

Maintain clear separation between:

### UI
React components are responsible for presentation and user interaction.

Do not place financial calculations or complex database logic directly inside React components.

### Services
Database access belongs in the service layer.

Prefer modules under:

`src/services/`

### Financial calculations
Business and financial calculations belong in:

`src/lib/calculations/`

Prefer pure functions whenever possible.

### Validation
Validate user input with Zod or the project's existing validation layer.

### Database
PostgreSQL/Supabase is the primary persistent data source.

### Security
Authorization must be enforced by Row Level Security and server-side checks where required.

Frontend visibility controls are not sufficient security.

---

## Critical accounting rules

These rules must never be violated.

### 1. Reimbursements

A reimbursement is not ordinary income.

A reimbursement reduces the net expense of its associated category.

Formula:

`NET EXPENSE = GROSS EXPENSES - REIMBURSEMENTS`

Example:

Nursery expense: €500

Regional reimbursement: €300

Net Nursery expense: €200

Normal income must not include the €300 reimbursement.

---

### 2. Transfers

Transfers between accounts or funds are financial transfers, not economic transactions.

Examples:

- Cash → Bank
- Bank → Holiday Fund
- Fund → Bank

Transfers must not affect:

- income
- expenses
- net expenses
- economic balance
- budget usage

They only affect financial balances.

---

### 3. Credit card purchases

A credit card purchase counts as an expense on the purchase date.

Example:

15 August — Groceries €100 — Credit Card

The €100 must immediately affect:

- monthly expenses
- category totals
- budget

It must not immediately reduce the linked bank account balance.

---

### 4. Credit card settlement

When the credit card is charged to the bank account, this is a financial settlement.

It must reduce the bank balance.

It must not create a second expense.

Never double-count credit card spending.

---

### 5. Future movements

Future movements within a month must affect the budget of that month immediately.

They must not affect the current financial account balance until their date is reached.

They must affect end-of-month forecasts.

---

### 6. Family sharing

A transaction must exist only once.

Do not create separate personal and family copies.

A movement always belongs to its owner and can optionally be shared with a household.

Personal dashboard:

includes all movements owned by the user.

Family dashboard:

includes only movements shared with the selected household.

---

### 7. Funds

Funds such as:

- Holiday
- Savings
- Deposit account
- Emergency fund

are financial containers.

They are not expense categories.

Moving money into a fund is not an expense.

Spending money from a fund for a real purchase is an expense.

---

### 8. Money values

Never use floating-point arithmetic for financial values.

Use PostgreSQL `NUMERIC` / `DECIMAL`.

Use safe decimal handling in TypeScript.

Store movement amounts as positive values.

Movement type determines whether the amount represents an income or expense.

---

## Balance rules

Movements and transfers are the accounting source of truth.

Cached balances exist only for performance.

All cached balances must remain rebuildable from:

- opening balance;
- movements;
- transfers;
- valid snapshots.

Do not create architecture where the current balance becomes the only authoritative value.

---

## Balance cache

Accounts and funds may have:

- `cached_balance`
- `cached_at`

When movements are created, updated, deleted, or imported, update or rebuild affected balances safely.

For bulk CSV imports, do not recalculate the balance after every row.

Import first, then rebuild affected balances once.

---

## Balance snapshots

Use monthly snapshots to speed up historical balance reconstruction.

If an old transaction changes, invalidate or rebuild affected later snapshots as required.

Never allow a snapshot to override the source transaction history.

---

## Budget rules

There is one monthly budget indicator.

Do not create separate "current budget" and "forecast budget".

Budget usage includes all known movements belonging to the month:

- already occurred expenses;
- future expenses;
- fixed expenses;
- credit card purchases;
- reimbursements;
- future reimbursements already entered.

Formula:

`BUDGET USED = MONTH EXPENSES - MONTH REIMBURSEMENTS`

Transfers do not affect budgets.

---

## Category hierarchy

Use:

`Macro-category → Category → Movement`

The user selects a category when entering a movement.

The macro-category is derived from the selected category.

Dashboard expense summaries should primarily aggregate by macro-category.

Do not duplicate macro-category information unnecessarily in movements if it can reliably be obtained through the category relationship.

---

## Soft deletion

Use soft deletion for movements and transfers where specified.

Default queries must exclude rows with `deleted_at` set.

Do not physically delete accounting history unless there is an explicit architectural requirement.

---

## Family privacy

A family member must never be able to access another user's non-shared personal financial data.

Enforce this at the database/RLS level.

Do not rely on frontend filtering.

When creating or editing family features, explicitly verify:

- authenticated user;
- household membership;
- resource ownership;
- sharing status;
- permission level.

---

## Supabase security

Never expose:

- service role key;
- database password;
- private secrets

to frontend code.

Use environment variables.

Any operation requiring elevated privileges must execute server-side.

Enable RLS on application tables exposed through Supabase.

---

## Database migrations

All database schema changes must be implemented using versioned migrations.

Do not make undocumented manual production schema changes.

Keep migrations logically separated.

Before changing an existing migration that may already have been applied, prefer creating a new migration.

---

## CSV import

CSV imports must follow this process:

1. Parse
2. Map columns
3. Validate
4. Detect possible duplicates
5. Preview
6. Confirm
7. Import
8. Recalculate affected balances

Do not silently discard potential duplicates.

Movements created during an import must retain their `import_batch_id`.

Support undoing an import using the import batch.

---

## UI principles

Design mobile-first for iPhone portrait orientation.

Prioritize:

- readability;
- large touch targets;
- compact financial summaries;
- clear hierarchy;
- minimal unnecessary decoration.

Do not design desktop-first and then shrink the interface.

The app should feel natural as a standalone iPhone PWA.

---

## Navigation

Main navigation should remain conceptually consistent with:

- Home
- Family
- Add
- Statistics
- More

Do not restructure primary navigation without a clear reason and without checking `MASTER_PROMPT.md`.

---

## Code quality

Prefer:

- small components;
- clear naming;
- typed interfaces;
- reusable services;
- pure calculation functions;
- minimal duplication.

Avoid:

- large monolithic files;
- duplicated business formulas;
- SQL directly inside presentation components;
- hard-coded categories or accounts;
- hidden side effects.

---

## Testing

Financial logic requires tests.

When modifying calculation behavior, add or update tests for relevant cases.

Important test areas include:

- income;
- gross expenses;
- reimbursements;
- net expenses;
- economic balance;
- categories;
- macro-categories;
- budget;
- future transactions;
- cash balance;
- bank balance;
- transfers;
- funds;
- credit cards;
- household sharing;
- CSV normalization.

Do not consider financial logic complete if important edge cases remain untested.

---

## Working procedure

Before implementing a significant feature:

1. inspect relevant existing files;
2. read the applicable sections of `MASTER_PROMPT.md`;
3. identify existing reusable services and components;
4. state briefly what you intend to change;
5. implement incrementally;
6. avoid unrelated refactors.

Do not rewrite working architecture merely because another implementation is possible.

---

## Before completing a task

Whenever practical, run:

- lint;
- TypeScript type checking;
- relevant automated tests.

If the project provides build validation, run that when appropriate.

Fix errors caused by your changes.

Do not hide unresolved errors.

---

## Completion report

At the end of a development task, report concisely:

- what was implemented;
- main files created or changed;
- database migrations added;
- tests added or updated;
- validation performed;
- unresolved issues;
- recommended next development step.

---

## Scope control

Do not implement future features merely because they are described in `MASTER_PROMPT.md`.

Implement only the feature or development phase currently requested.

Preserve the architecture required for later phases without prematurely building them.

---

## Guiding principle

Correctness of financial data, privacy, and maintainability take priority over implementation speed.

When uncertain about financial behavior, do not invent a rule.

Check `MASTER_PROMPT.md` first.