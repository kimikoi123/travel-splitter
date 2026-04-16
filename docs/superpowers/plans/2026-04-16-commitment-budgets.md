# Commitment Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe subscription/telecom/utility preset budgets as *commitment* budgets — fixed or variable recurring bills with a due-day and a pending-confirm flow — so they stop being tracked as flexible discretionary budgets.

**Architecture:** Extend the existing `Budget` entity with optional commitment fields. A pure helpers module computes per-month state (pending, next due date, auto-confirm plan). The `useBudgets` hook surfaces derived UI state; auto-confirm writes happen from `App.tsx` (so both `useBudgets` and `useTransactions` state stay in sync). A new confirm-bill dialog handles the "varies each month" bills; a dashboard banner surfaces pending items.

**Tech Stack:** React 19 + TypeScript, Vitest for tests, Dexie (IndexedDB), existing `storage.ts` for DB writes, lucide-react icons, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-04-16-commitment-budgets-design.md`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add commitment fields to `Budget` interface. |
| `src/utils/commitmentBudgets.ts` | Create | Pure helpers: `clampDueDay`, `resolveDueDate`, `monthKey`, `deriveCommitmentState`, `planAutoConfirm`. |
| `src/utils/commitmentBudgets.test.ts` | Create | Unit tests for all helpers. |
| `src/hooks/useBudgets.ts` | Modify | Extend `BudgetWithSpending` with `isPendingThisMonth` and `nextDueDate`; expose `runAutoConfirm(addTransaction)`. |
| `src/App.tsx` | Modify | Invoke `runAutoConfirm` once both hooks finish loading; own the ConfirmBillDialog visibility state. |
| `src/components/CreateBudgetFlow.tsx` | Modify | Render commitment fields in step 2 when a subscription/telecom/utility preset is selected (or when editing a preset-backed budget). |
| `src/components/BudgetList.tsx` | Modify | Split custom budgets into "Commitments" vs "Your custom budgets"; render a commitment-variant card. |
| `src/components/ConfirmBillDialog.tsx` | Create | Modal for confirming a variable commitment bill's actual amount. |
| `src/components/HomeDashboard.tsx` | Modify | Add pending-bills banner at the top when any commitment has `isPendingThisMonth`. |

---

## Task 1: Add commitment fields to the Budget type

**Files:**
- Modify: `src/types.ts:144-157`

- [ ] **Step 1: Extend the Budget interface**

In `src/types.ts`, replace the existing `Budget` interface with:

```ts
export interface Budget {
  id: string;
  name: string;
  type: 'category' | 'custom';
  categoryKey?: string;
  monthlyLimit: number;
  currency: string;
  icon: string;
  color: string;
  preset?: string;
  createdAt: string;
  updatedAt?: number;
  deletedAt?: number;

  // Commitment fields — present iff isCommitment === true
  isCommitment?: boolean;
  dueDay?: number;             // 1-31; clamped to last day of month when rendered
  varies?: boolean;            // true => pending-confirm flow; false => auto-confirm
  sourceAccountId?: string;    // optional account the bill deducts from
  lastConfirmedMonth?: string; // "YYYY-MM" — most recent month auto-confirmed or user-confirmed
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). Existing code that constructs `Budget` keeps working because every new field is optional.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(budgets): add commitment fields to Budget type"
```

---

## Task 2: Create pure helpers — clampDueDay, resolveDueDate, monthKey

**Files:**
- Create: `src/utils/commitmentBudgets.ts`
- Create: `src/utils/commitmentBudgets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/commitmentBudgets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampDueDay, resolveDueDate, monthKey } from './commitmentBudgets';

describe('clampDueDay', () => {
  it('returns dueDay unchanged when within the month', () => {
    expect(clampDueDay(15, 2026, 4)).toBe(15);  // April has 30 days
    expect(clampDueDay(1, 2026, 4)).toBe(1);
    expect(clampDueDay(30, 2026, 4)).toBe(30);
  });

  it('clamps to last day of short months', () => {
    expect(clampDueDay(31, 2026, 2)).toBe(28);  // Feb 2026 non-leap
    expect(clampDueDay(31, 2024, 2)).toBe(29);  // Feb 2024 leap
    expect(clampDueDay(31, 2026, 4)).toBe(30);  // April
    expect(clampDueDay(31, 2026, 6)).toBe(30);  // June
  });
});

describe('resolveDueDate', () => {
  it('returns ISO date for a given month and dueDay', () => {
    expect(resolveDueDate(15, 2026, 4)).toBe('2026-04-15');
    expect(resolveDueDate(1, 2026, 1)).toBe('2026-01-01');
  });

  it('clamps short months', () => {
    expect(resolveDueDate(31, 2026, 2)).toBe('2026-02-28');
    expect(resolveDueDate(31, 2024, 2)).toBe('2024-02-29');
  });
});

describe('monthKey', () => {
  it('formats Date objects as YYYY-MM', () => {
    expect(monthKey(new Date(2026, 3, 16))).toBe('2026-04');  // April = month 3
    expect(monthKey(new Date(2026, 0, 1))).toBe('2026-01');
    expect(monthKey(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('formats ISO date strings as YYYY-MM', () => {
    expect(monthKey('2026-04-16')).toBe('2026-04');
    expect(monthKey('2026-12-01')).toBe('2026-12');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- commitmentBudgets`
Expected: FAIL — "Cannot find module './commitmentBudgets'".

- [ ] **Step 3: Implement the helpers**

Create `src/utils/commitmentBudgets.ts`:

```ts
// Pure helpers for commitment budgets. No DB, no React, no side effects.

export function clampDueDay(dueDay: number, year: number, month: number): number {
  // month is 1-12
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, dueDay), lastDay);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function resolveDueDate(dueDay: number, year: number, month: number): string {
  const day = clampDueDay(dueDay, year, month);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function monthKey(date: Date | string): string {
  if (typeof date === 'string') {
    // Assume "YYYY-MM-DD"
    return date.slice(0, 7);
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- commitmentBudgets`
Expected: PASS — all three describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/commitmentBudgets.ts src/utils/commitmentBudgets.test.ts
git commit -m "feat(budgets): add commitment date helpers"
```

---

## Task 3: Add deriveCommitmentState helper

**Files:**
- Modify: `src/utils/commitmentBudgets.ts`
- Modify: `src/utils/commitmentBudgets.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/commitmentBudgets.test.ts`:

```ts
import { deriveCommitmentState } from './commitmentBudgets';
import type { Budget } from '../types';

function makeCommitment(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    name: 'Meralco',
    type: 'custom',
    monthlyLimit: 2800,
    currency: 'PHP',
    icon: 'M',
    color: '#f7941d',
    preset: 'meralco',
    createdAt: '2026-01-01T00:00:00.000Z',
    isCommitment: true,
    dueDay: 15,
    varies: true,
    ...overrides,
  };
}

describe('deriveCommitmentState', () => {
  it('returns null fields for non-commitment budgets', () => {
    const flexible = makeCommitment({ isCommitment: false });
    const today = new Date(2026, 3, 16);
    const state = deriveCommitmentState(flexible, today);
    expect(state.isPendingThisMonth).toBe(false);
    expect(state.nextDueDate).toBeUndefined();
  });

  it('is pending when varies=true, due-day passed, and not confirmed this month', () => {
    const b = makeCommitment({ dueDay: 15, varies: true });
    const today = new Date(2026, 3, 16);  // Apr 16
    const state = deriveCommitmentState(b, today);
    expect(state.isPendingThisMonth).toBe(true);
    expect(state.nextDueDate).toBe('2026-04-15');
  });

  it('is not pending before due-day', () => {
    const b = makeCommitment({ dueDay: 15, varies: true });
    const today = new Date(2026, 3, 10);  // Apr 10
    const state = deriveCommitmentState(b, today);
    expect(state.isPendingThisMonth).toBe(false);
    expect(state.nextDueDate).toBe('2026-04-15');
  });

  it('is not pending when varies=false (auto-confirm path)', () => {
    const b = makeCommitment({ dueDay: 15, varies: false });
    const today = new Date(2026, 3, 20);
    const state = deriveCommitmentState(b, today);
    expect(state.isPendingThisMonth).toBe(false);
  });

  it('is not pending when already confirmed this month', () => {
    const b = makeCommitment({ dueDay: 15, varies: true, lastConfirmedMonth: '2026-04' });
    const today = new Date(2026, 3, 20);
    const state = deriveCommitmentState(b, today);
    expect(state.isPendingThisMonth).toBe(false);
    expect(state.nextDueDate).toBe('2026-05-15');  // next month's due-day
  });

  it('points nextDueDate to next month after confirmation, clamping short months', () => {
    const b = makeCommitment({ dueDay: 31, varies: false, lastConfirmedMonth: '2026-01' });
    const today = new Date(2026, 0, 31);
    const state = deriveCommitmentState(b, today);
    expect(state.nextDueDate).toBe('2026-02-28');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- commitmentBudgets`
Expected: FAIL — `deriveCommitmentState is not a function`.

- [ ] **Step 3: Implement deriveCommitmentState**

Append to `src/utils/commitmentBudgets.ts`:

```ts
import type { Budget } from '../types';

export interface CommitmentState {
  isPendingThisMonth: boolean;
  nextDueDate?: string;
}

export function deriveCommitmentState(budget: Budget, today: Date): CommitmentState {
  if (!budget.isCommitment || budget.dueDay === undefined) {
    return { isPendingThisMonth: false };
  }

  const todayKey = monthKey(today);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;  // 1-12
  const thisMonthDueDate = resolveDueDate(budget.dueDay, year, month);
  const todayISO = `${year}-${pad2(month)}-${pad2(today.getDate())}`;
  const alreadyConfirmed = budget.lastConfirmedMonth === todayKey;

  let nextDueDate: string;
  if (alreadyConfirmed) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    nextDueDate = resolveDueDate(budget.dueDay, nextYear, nextMonth);
  } else {
    nextDueDate = thisMonthDueDate;
  }

  const isPendingThisMonth =
    budget.varies === true &&
    !alreadyConfirmed &&
    todayISO >= thisMonthDueDate;

  return { isPendingThisMonth, nextDueDate };
}
```

Note: `pad2` is already defined in the file from Task 2; reuse it. If it isn't exported, keep it module-private — tests don't need to import it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- commitmentBudgets`
Expected: PASS — all `deriveCommitmentState` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/commitmentBudgets.ts src/utils/commitmentBudgets.test.ts
git commit -m "feat(budgets): derive commitment pending state"
```

---

## Task 4: Add planAutoConfirm helper

**Files:**
- Modify: `src/utils/commitmentBudgets.ts`
- Modify: `src/utils/commitmentBudgets.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/commitmentBudgets.test.ts`:

```ts
import { planAutoConfirm } from './commitmentBudgets';

describe('planAutoConfirm', () => {
  it('returns no actions for non-commitment budgets', () => {
    const flexible = makeCommitment({ isCommitment: false });
    const plan = planAutoConfirm([flexible], new Date(2026, 3, 20));
    expect(plan).toEqual([]);
  });

  it('returns no actions for varies=true (user must confirm)', () => {
    const b = makeCommitment({ varies: true });
    const plan = planAutoConfirm([b], new Date(2026, 3, 20));
    expect(plan).toEqual([]);
  });

  it('returns no actions before due-day', () => {
    const b = makeCommitment({ varies: false, dueDay: 20 });
    const plan = planAutoConfirm([b], new Date(2026, 3, 10));
    expect(plan).toEqual([]);
  });

  it('plans a single auto-confirm when due-day passed and not confirmed', () => {
    const b = makeCommitment({ id: 'b1', name: 'Netflix', monthlyLimit: 549, varies: false, dueDay: 15 });
    const plan = planAutoConfirm([b], new Date(2026, 3, 20));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      budgetId: 'b1',
      newLastConfirmedMonth: '2026-04',
      transaction: {
        type: 'expense',
        amount: 549,
        currency: 'PHP',
        date: '2026-04-15',
        category: 'bills',
        description: 'Netflix',
        budgetId: 'b1',
      },
    });
  });

  it('backfills multiple months when lastConfirmedMonth is old', () => {
    const b = makeCommitment({
      id: 'b1',
      name: 'Netflix',
      monthlyLimit: 549,
      varies: false,
      dueDay: 15,
      lastConfirmedMonth: '2026-01',
    });
    const plan = planAutoConfirm([b], new Date(2026, 3, 20));  // April 20
    expect(plan.map((a) => a.transaction.date)).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
    expect(plan[plan.length - 1]!.newLastConfirmedMonth).toBe('2026-04');
  });

  it('does not re-plan months already confirmed', () => {
    const b = makeCommitment({ varies: false, dueDay: 15, lastConfirmedMonth: '2026-04' });
    const plan = planAutoConfirm([b], new Date(2026, 3, 20));
    expect(plan).toEqual([]);
  });

  it('includes sourceAccountId when set', () => {
    const b = makeCommitment({ varies: false, dueDay: 15, sourceAccountId: 'acct-1' });
    const plan = planAutoConfirm([b], new Date(2026, 3, 20));
    expect(plan[0]!.transaction.accountId).toBe('acct-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- commitmentBudgets`
Expected: FAIL — `planAutoConfirm is not a function`.

- [ ] **Step 3: Implement planAutoConfirm**

Append to `src/utils/commitmentBudgets.ts`:

```ts
import type { Transaction } from '../types';

export interface AutoConfirmAction {
  budgetId: string;
  newLastConfirmedMonth: string;
  transaction: Omit<Transaction, 'id' | 'createdAt'>;
}

export function planAutoConfirm(budgets: Budget[], today: Date): AutoConfirmAction[] {
  const actions: AutoConfirmAction[] = [];
  const todayKey = monthKey(today);

  for (const b of budgets) {
    if (!b.isCommitment || b.varies !== false || b.dueDay === undefined) continue;

    // Determine starting month (first unconfirmed month, inclusive)
    let year: number;
    let month: number;  // 1-12
    if (b.lastConfirmedMonth) {
      const [ly, lm] = b.lastConfirmedMonth.split('-').map(Number);
      // Start at the month AFTER lastConfirmedMonth
      year = lm === 12 ? ly! + 1 : ly!;
      month = lm === 12 ? 1 : lm! + 1;
    } else {
      year = today.getFullYear();
      month = today.getMonth() + 1;
    }

    while (true) {
      const iterKey = `${year}-${pad2(month)}`;
      if (iterKey > todayKey) break;

      const dueDateISO = resolveDueDate(b.dueDay, year, month);
      const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

      // For the current month, only post if due-day has arrived.
      // For past months (backfill), always post — the due-day is already in the past.
      if (iterKey === todayKey && todayISO < dueDateISO) break;

      actions.push({
        budgetId: b.id,
        newLastConfirmedMonth: iterKey,
        transaction: {
          type: 'expense',
          amount: b.monthlyLimit,
          currency: b.currency,
          category: 'bills',
          description: b.name,
          date: dueDateISO,
          budgetId: b.id,
          accountId: b.sourceAccountId,
        },
      });

      // Advance to next month
      if (month === 12) {
        year += 1;
        month = 1;
      } else {
        month += 1;
      }
    }
  }

  return actions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- commitmentBudgets`
Expected: PASS — all `planAutoConfirm` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/commitmentBudgets.ts src/utils/commitmentBudgets.test.ts
git commit -m "feat(budgets): plan auto-confirm actions with backfill"
```

---

## Task 5: Extend BudgetWithSpending with commitment state

**Files:**
- Modify: `src/hooks/useBudgets.ts:11-15, 52-78`

- [ ] **Step 1: Update the BudgetWithSpending interface**

Replace lines 11-15 in `src/hooks/useBudgets.ts`:

```ts
export interface BudgetWithSpending extends Budget {
  spent: number;
  remaining: number;
  percentage: number;

  // Only populated when isCommitment === true
  isPendingThisMonth?: boolean;
  nextDueDate?: string;
}
```

- [ ] **Step 2: Wire deriveCommitmentState into the useMemo**

Add the import at the top of `src/hooks/useBudgets.ts`:

```ts
import { deriveCommitmentState } from '../utils/commitmentBudgets';
```

Then replace the inside of the `budgets.map((budget) => { ... })` block (lines 63-77) with:

```ts
return budgets.map((budget) => {
  let spent = 0;
  if (budget.type === 'category' && budget.categoryKey) {
    spent = thisMonthExpenses
      .filter((t) => t.category === budget.categoryKey)
      .reduce((sum, t) => sum + t.amount, 0);
  } else if (budget.type === 'custom') {
    spent = thisMonthExpenses
      .filter((t) => t.budgetId === budget.id)
      .reduce((sum, t) => sum + t.amount, 0);
  }
  const remaining = Math.max(0, budget.monthlyLimit - spent);
  const percentage = budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;

  const commitmentState = budget.isCommitment
    ? deriveCommitmentState(budget, now)
    : { isPendingThisMonth: false, nextDueDate: undefined };

  return {
    ...budget,
    spent,
    remaining,
    percentage,
    isPendingThisMonth: commitmentState.isPendingThisMonth,
    nextDueDate: commitmentState.nextDueDate,
  };
});
```

Note: `now` is the `new Date()` already declared at the top of the useMemo (line 53). Reuse it.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: PASS — all prior commitmentBudgets tests still pass; no other tests affected.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBudgets.ts
git commit -m "feat(budgets): surface commitment pending state from useBudgets"
```

---

## Task 6: Wire auto-confirm execution in App.tsx

**Files:**
- Modify: `src/hooks/useBudgets.ts` (export `runAutoConfirmOnce`)
- Modify: `src/App.tsx` (add a useEffect that runs the plan)

- [ ] **Step 1: Expose runAutoConfirmOnce from useBudgets**

Add to `src/hooks/useBudgets.ts` imports:

```ts
import { planAutoConfirm } from '../utils/commitmentBudgets';
```

Inside the `useBudgets` hook body, add before the `return`:

```ts
const runAutoConfirmOnce = useCallback(
  async (addTransaction: (txn: Omit<Transaction, 'id' | 'createdAt'>) => Promise<Transaction>) => {
    const plan = planAutoConfirm(budgets, new Date());
    if (plan.length === 0) return;
    for (const action of plan) {
      await addTransaction(action.transaction);
      await dbUpdateBudget(action.budgetId, { lastConfirmedMonth: action.newLastConfirmedMonth });
    }
    // Refresh local budget state to pick up lastConfirmedMonth stamps
    await refresh();
  },
  [budgets, refresh]
);
```

And update the hook's return to include it:

```ts
return { budgets: budgetsWithSpending, loading, addBudget, editBudget, removeBudget, runAutoConfirmOnce };
```

- [ ] **Step 2: Call runAutoConfirmOnce from App.tsx**

In `src/App.tsx`, after the `useTransactions` / `useBudgets` declarations (around line 83-86), add:

```tsx
const hasRunAutoConfirm = useRef(false);
useEffect(() => {
  if (hasRunAutoConfirm.current) return;
  if (transactions === undefined) return;  // still loading
  hasRunAutoConfirm.current = true;
  void runAutoConfirmOnce(addTransaction);
}, [transactions, runAutoConfirmOnce, addTransaction]);
```

Destructure `runAutoConfirmOnce` out of `useBudgets()` and import `useRef, useEffect` from `react` if not already imported.

Note: The guard is a ref (not state) so the effect runs exactly once per app session, not per render. `transactions` being truthy (array vs undefined) is the readiness signal.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev` and open the app in a browser.
2. Use devtools to create a test budget in IndexedDB with `isCommitment: true, varies: false, dueDay: <yesterday's day>, monthlyLimit: 100, lastConfirmedMonth: undefined`.
3. Refresh the app.
4. Open the Transactions list — verify a new ₱100 "bills" expense was created with today's (or yesterday's) date.
5. Open the budget in IndexedDB — verify `lastConfirmedMonth` is stamped with the current `YYYY-MM`.
6. Refresh again — verify no duplicate transaction is created.

Expected: one transaction posted, `lastConfirmedMonth` stamped, no double-post on refresh.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBudgets.ts src/App.tsx
git commit -m "feat(budgets): auto-confirm fixed commitments on app open"
```

---

## Task 7: Add commitment fields to CreateBudgetFlow

**Files:**
- Modify: `src/components/CreateBudgetFlow.tsx`

- [ ] **Step 1: Detect commitment-capable presets**

Near the top of `CreateBudgetFlow.tsx`, add a helper (after imports):

```ts
const COMMITMENT_PRESET_CATEGORIES: ReadonlyArray<'subscription' | 'telecom' | 'utility'> = [
  'subscription',
  'telecom',
  'utility',
];

function isCommitmentPreset(preset: BudgetPreset | null): boolean {
  if (!preset) return false;
  return COMMITMENT_PRESET_CATEGORIES.includes(preset.category);
}

function defaultVariesForPreset(preset: BudgetPreset): boolean {
  return preset.category === 'telecom' || preset.category === 'utility';
}
```

- [ ] **Step 2: Add commitment state**

Inside the component (after `const [selectedColor, setSelectedColor] = useState(...)`), add:

```ts
const [dueDay, setDueDay] = useState<string>(() => {
  if (isEditing && editingBudget.dueDay !== undefined) return String(editingBudget.dueDay);
  return '';
});
const [varies, setVaries] = useState<boolean>(() => {
  if (isEditing && editingBudget.varies !== undefined) return editingBudget.varies;
  if (selectedPreset) return defaultVariesForPreset(selectedPreset);
  return false;
});
const [sourceAccountId, setSourceAccountId] = useState<string | undefined>(
  () => editingBudget?.sourceAccountId
);
```

Also add an `accounts` prop to the component signature. Update the props interface:

```ts
interface CreateBudgetFlowProps {
  mode: 'category' | 'custom';
  existingBudgets: Budget[];
  accounts: { id: string; name: string }[];  // NEW
  onSave: (data: Omit<Budget, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  editingBudget?: Budget;
}
```

- [ ] **Step 3: Update handlePresetSelect to set varies default**

Replace the existing `handlePresetSelect` (lines 104-110) with:

```tsx
const handlePresetSelect = useCallback((preset: BudgetPreset) => {
  setSelectedPreset(preset);
  setIsCustomEntry(false);
  setName(preset.name);
  setSelectedColor(preset.color);
  setVaries(defaultVariesForPreset(preset));
  setStep(2);
}, []);
```

- [ ] **Step 4: Update canSave and handleSave to require dueDay for commitment mode**

Also determine `isCommitmentMode` based on preset OR editing a commitment-capable budget. Helper first, then derived value:

```tsx
function isPresetKeyCommitmentCapable(presetKey: string | undefined): boolean {
  if (!presetKey) return false;
  const preset = BUDGET_PRESETS.find((p) => p.key === presetKey);
  return preset ? COMMITMENT_PRESET_CATEGORIES.includes(preset.category) : false;
}

const isCommitmentMode =
  (mode === 'custom' && isCommitmentPreset(selectedPreset)) ||
  (isEditing && editingBudget.isCommitment === true) ||
  (isEditing && isPresetKeyCommitmentCapable(editingBudget.preset));
```

`isPresetKeyCommitmentCapable` can live as a module-level helper next to `isCommitmentPreset`.

Update `canSave`:

```tsx
const canSave = (() => {
  if (parsedAmount <= 0) return false;
  if (mode === 'category') return selectedCategory !== null;
  if (name.trim().length === 0) return false;
  if (isCommitmentMode) {
    const d = parseInt(dueDay, 10);
    if (!Number.isFinite(d) || d < 1 || d > 31) return false;
  }
  return true;
})();
```

Update `handleSave` for the custom branch (lines 148-157):

```tsx
// custom mode
const commitmentFields = isCommitmentMode
  ? {
      isCommitment: true as const,
      dueDay: parseInt(dueDay, 10),
      varies,
      sourceAccountId: sourceAccountId || undefined,
    }
  : {};

onSave({
  name: name.trim(),
  type: 'custom',
  monthlyLimit: parsedAmount,
  currency: 'PHP',
  icon: getPresetInitials(name.trim()),
  color: selectedColor,
  preset: selectedPreset?.key ?? undefined,
  ...commitmentFields,
});
```

- [ ] **Step 5: Render commitment fields in CustomBudgetForm**

Pass the new state into `CustomBudgetForm`:

```tsx
{mode === 'custom' && step === 2 && (
  <CustomBudgetForm
    name={name}
    setName={setName}
    amount={amount}
    setAmount={setAmount}
    selectedColor={selectedColor}
    setSelectedColor={setSelectedColor}
    isCustomEntry={isCustomEntry}
    isCommitmentMode={isCommitmentMode}
    dueDay={dueDay}
    setDueDay={setDueDay}
    varies={varies}
    setVaries={setVaries}
    sourceAccountId={sourceAccountId}
    setSourceAccountId={setSourceAccountId}
    accounts={accounts}
  />
)}
```

Update `CustomBudgetForm`'s signature:

```tsx
function CustomBudgetForm({
  name, setName, amount, setAmount, selectedColor, setSelectedColor, isCustomEntry,
  isCommitmentMode, dueDay, setDueDay, varies, setVaries, sourceAccountId, setSourceAccountId, accounts,
}: {
  name: string; setName: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  selectedColor: string; setSelectedColor: (v: string) => void;
  isCustomEntry: boolean;
  isCommitmentMode: boolean;
  dueDay: string; setDueDay: (v: string) => void;
  varies: boolean; setVaries: (v: boolean) => void;
  sourceAccountId: string | undefined; setSourceAccountId: (v: string | undefined) => void;
  accounts: { id: string; name: string }[];
})
```

When `isCommitmentMode`, change the "Monthly Limit" label to "Expected Amount" and render additional fields below it (before the Color picker):

```tsx
{isCommitmentMode && (
  <>
    <div>
      <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
        Due Day
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        placeholder="e.g. 15"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        aria-label="Due day of month"
        className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-text-primary placeholder:text-text-secondary/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
      />
      <p className="text-[11px] text-text-tertiary mt-1">Day of the month (1–31). Auto-adjusts for short months.</p>
    </div>

    <div>
      <label className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-3">
        <span className="text-sm text-text-primary">Varies each month</span>
        <input
          type="checkbox"
          checked={varies}
          onChange={(e) => setVaries(e.target.checked)}
          className="h-5 w-5"
          aria-label="Bill amount varies each month"
        />
      </label>
      <p className="text-[11px] text-text-tertiary mt-1">
        {varies
          ? 'Bill posts as pending until you confirm the actual amount.'
          : 'Bill auto-posts at the expected amount each month.'}
      </p>
    </div>

    <div>
      <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
        Source Account (optional)
      </label>
      <select
        value={sourceAccountId ?? ''}
        onChange={(e) => setSourceAccountId(e.target.value || undefined)}
        aria-label="Source account"
        className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
      >
        <option value="">None</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  </>
)}
```

Also change the "Monthly Limit" label conditionally:

```tsx
<label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
  {isCommitmentMode ? 'Expected Amount' : 'Monthly Limit'}
</label>
```

- [ ] **Step 6: Update the header title for commitment mode**

Change `headerTitle` (around line 160):

```tsx
const headerTitle = (() => {
  if (isEditing) return 'Edit Budget';
  if (mode === 'category') return 'Category Budget';
  if (step === 1) return 'Choose Preset';
  if (isCommitmentMode) return 'Set Up Commitment';
  return 'Budget Details';
})();
```

- [ ] **Step 7: Pass accounts prop from App.tsx**

In `src/App.tsx`, find the two places `CreateBudgetFlow` is rendered and add `accounts={accounts}`. If `accounts` isn't already in scope in App.tsx, it comes from `useAccounts()` — check the surrounding hook usage and destructure `accounts` alongside it.

- [ ] **Step 8: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: PASS.

Then `npm run dev`, create a Netflix budget:
- Pick "Netflix" from preset grid.
- Verify header says "Set Up Commitment".
- Verify "Expected Amount" label (not "Monthly Limit").
- Verify Due Day, Varies toggle (default OFF), Source Account dropdown are visible.
- Fill ₱549, day 15, OFF, leave source unset.
- Save.
- Reopen the saved budget — verify all fields round-trip correctly.

Then create a Meralco budget:
- Pick "Meralco" from preset grid.
- Verify Varies toggle defaults to ON.

Finally create a "Custom" (user-named) budget:
- Pick "Custom" tile.
- Verify no commitment fields appear.
- Verify header says "Budget Details".

- [ ] **Step 9: Commit**

```bash
git add src/components/CreateBudgetFlow.tsx src/App.tsx
git commit -m "feat(budgets): capture commitment fields in create flow"
```

---

## Task 8: BudgetList — three-section split and commitment card

**Files:**
- Modify: `src/components/BudgetList.tsx`

- [ ] **Step 1: Split customBudgets into commitments vs flexible**

In `BudgetList.tsx`, replace line 109-110:

```tsx
const commitmentBudgets = budgets.filter((b) => b.type === 'custom' && b.isCommitment === true);
const flexibleCustomBudgets = budgets.filter((b) => b.type === 'custom' && b.isCommitment !== true);
const categoryBudgets = budgets.filter((b) => b.type === 'category');
const hasNoBudgets = budgets.length === 0;
```

Replace the "Your custom budgets" section (lines 161-180) with:

```tsx
{/* Commitments Section */}
{commitmentBudgets.length > 0 && (
  <section className="mb-6">
    <h2 className="text-sm font-semibold text-text-secondary mb-1">
      Commitments
    </h2>
    <p className="text-xs text-text-tertiary mb-3">
      Fixed and variable recurring bills. Variable bills need confirmation each month.
    </p>
    <div className="flex flex-col gap-2">
      {commitmentBudgets.map((budget) => (
        <CommitmentCard
          key={budget.id}
          budget={budget}
          onEdit={() => onEdit(budget)}
          onDelete={() => setPendingDelete(budget)}
          onConfirm={() => onConfirmBill(budget)}
        />
      ))}
    </div>
  </section>
)}

{/* Flexible custom budgets Section */}
{flexibleCustomBudgets.length > 0 && (
  <section className="mb-6">
    <h2 className="text-sm font-semibold text-text-secondary mb-1">
      Your custom budgets
    </h2>
    <p className="text-xs text-text-tertiary mb-3">
      Edit or delete the extra categories you created for finer tracking.
    </p>
    <div className="flex flex-col gap-2">
      {flexibleCustomBudgets.map((budget) => (
        <BudgetCard
          key={budget.id}
          budget={budget}
          onEdit={() => onEdit(budget)}
          onDelete={() => setPendingDelete(budget)}
        />
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 2: Add onConfirmBill prop**

Update `BudgetListProps` (lines 10-17):

```tsx
interface BudgetListProps {
  budgets: BudgetWithSpending[];
  onCreateCategory: () => void;
  onCreateCustom: () => void;
  onEdit: (budget: Budget) => void;
  onDelete: (id: string) => void;
  onConfirmBill: (budget: BudgetWithSpending) => void;  // NEW
  onBack: () => void;
}
```

Destructure `onConfirmBill` in the function signature.

- [ ] **Step 3: Implement CommitmentCard component**

Add above the existing `BudgetCard` definition (around line 25):

```tsx
function CommitmentCard({
  budget,
  onEdit,
  onDelete,
  onConfirm,
}: {
  budget: BudgetWithSpending;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}) {
  const confirmedThisMonth =
    budget.lastConfirmedMonth === new Date().toISOString().slice(0, 7);
  const isPending = budget.isPendingThisMonth === true;

  const secondary: { text: string; pill?: { label: string; tone: 'amber' | 'success' } } = (() => {
    if (isPending) {
      return { text: 'Due today · tap to confirm', pill: { label: 'PENDING', tone: 'amber' } };
    }
    if (confirmedThisMonth) {
      return {
        text: `Paid ${formatCurrency(budget.spent, budget.currency)} · next ${formatISOShort(budget.nextDueDate)}`,
        pill: { label: 'PAID', tone: 'success' },
      };
    }
    if (budget.varies === false) {
      return { text: `Next: ${formatISOShort(budget.nextDueDate)} · auto-posts ${formatCurrency(budget.monthlyLimit, budget.currency)}` };
    }
    return { text: `Next: ${formatISOShort(budget.nextDueDate)} · est. ${formatCurrency(budget.monthlyLimit, budget.currency)}` };
  })();

  const pillClass =
    secondary.pill?.tone === 'amber'
      ? 'bg-amber-500/15 text-amber-600'
      : 'bg-success/15 text-success';

  return (
    <button
      type="button"
      onClick={isPending ? onConfirm : undefined}
      disabled={!isPending}
      className={`bg-surface rounded-2xl border border-white/[0.06] p-4 flex items-start gap-3 text-left transition-all ${
        isPending ? 'hover:bg-surface-hover active:scale-[0.98] cursor-pointer' : 'cursor-default'
      }`}
    >
      <LogoBadge
        logo={budget.preset ? getBudgetPreset(budget.preset)?.logo : undefined}
        name={budget.name}
        color={budget.color}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text-primary truncate">{budget.name}</p>
          {secondary.pill && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${pillClass}`}>
              {secondary.pill.label}
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-0.5">{secondary.text}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-light transition-colors"
          aria-label={`Edit ${budget.name}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-surface-light transition-colors"
          aria-label={`Delete ${budget.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </button>
  );
}

function formatISOShort(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Thread onConfirmBill through App.tsx**

In `src/App.tsx`, find where `<BudgetList ... />` is rendered (around line 508). Add the prop:

```tsx
onConfirmBill={(budget) => setPendingConfirmBill(budget)}
```

Add state near other BudgetList state:

```tsx
const [pendingConfirmBill, setPendingConfirmBill] = useState<BudgetWithSpending | null>(null);
```

This state is consumed in Task 10 when we wire up the dialog. For now the setter is a no-op side effect.

- [ ] **Step 5: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: PASS.

Then `npm run dev`:
- Open Budgets screen.
- Confirm commitments (if you created any in Task 7 smoke) appear under a new "Commitments" section.
- Confirm flexible custom budgets appear under "Your custom budgets".
- Commitment card shows the correct secondary line depending on varies/pending/confirmed.
- Edit and Delete buttons still work (don't trigger the confirm path).

- [ ] **Step 6: Commit**

```bash
git add src/components/BudgetList.tsx src/App.tsx
git commit -m "feat(budgets): split list into commitments vs flexible"
```

---

## Task 9: Create ConfirmBillDialog

**Files:**
- Create: `src/components/ConfirmBillDialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ConfirmBillDialog.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Budget, Transaction } from '../types';
import type { BudgetWithSpending } from '../hooks/useBudgets';
import { formatCurrency } from '../utils/currencies';
import { parseAmountInput } from '../utils/amountParser';
import { monthKey } from '../utils/commitmentBudgets';
import LogoBadge from './ui/LogoBadge';
import { getBudgetPreset } from '../utils/budgetPresets';

interface ConfirmBillDialogProps {
  budget: BudgetWithSpending;
  accounts: { id: string; name: string }[];
  onConfirm: (txn: Omit<Transaction, 'id' | 'createdAt'>, newLastConfirmedMonth: string) => Promise<void> | void;
  onSkip: () => void;
  onClose: () => void;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ConfirmBillDialog({
  budget,
  accounts,
  onConfirm,
  onSkip,
  onClose,
}: ConfirmBillDialogProps) {
  const [amount, setAmount] = useState<string>(String(budget.monthlyLimit));
  const [date, setDate] = useState<string>(budget.nextDueDate ?? todayISO());
  const [accountId, setAccountId] = useState<string | undefined>(budget.sourceAccountId);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when the budget being confirmed changes (e.g., advancing to next pending)
  useEffect(() => {
    setAmount(String(budget.monthlyLimit));
    setDate(budget.nextDueDate ?? todayISO());
    setAccountId(budget.sourceAccountId);
  }, [budget.id, budget.monthlyLimit, budget.nextDueDate, budget.sourceAccountId]);

  const parsed = parseAmountInput(amount);
  const canSubmit = parsed > 0 && date.length === 10 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onConfirm(
      {
        type: 'expense',
        amount: parsed,
        currency: budget.currency,
        category: 'bills',
        description: budget.name,
        date,
        budgetId: budget.id,
        accountId,
      },
      monthKey(date)
    );
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-bg w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center text-text-secondary"
          >
            <X size={20} />
          </button>
          <h2 className="text-base font-semibold text-text-primary">Confirm bill</h2>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-text-secondary px-2"
          >
            Skip
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <LogoBadge
            logo={budget.preset ? getBudgetPreset(budget.preset)?.logo : undefined}
            name={budget.name}
            color={budget.color}
            size="md"
          />
          <div>
            <p className="text-sm font-semibold text-text-primary">{budget.name}</p>
            <p className="text-xs text-text-secondary">
              Due {budget.nextDueDate} · estimated {formatCurrency(budget.monthlyLimit, budget.currency)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
              Actual Amount
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Actual bill amount"
              className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
              Date Paid
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date paid"
              className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
            />
          </div>

          <div>
            <label className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 block">
              Source Account
            </label>
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value || undefined)}
              aria-label="Source account"
              className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canSubmit}
          className={`w-full mt-5 rounded-2xl py-3.5 font-semibold text-sm transition-all ${
            canSubmit
              ? 'bg-primary text-white active:opacity-80'
              : 'bg-primary/40 text-white/50 cursor-not-allowed'
          }`}
        >
          Confirm &amp; save
        </button>
      </div>
    </div>
  );
}
```

Note: `Budget` import at the top is unused here but you may remove it — only `BudgetWithSpending` and `Transaction` are referenced. Clean up unused imports.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConfirmBillDialog.tsx
git commit -m "feat(budgets): add confirm-bill dialog component"
```

---

## Task 10: Wire ConfirmBillDialog into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import and render the dialog**

Add the import at the top of `src/App.tsx`:

```tsx
import ConfirmBillDialog from './components/ConfirmBillDialog';
```

Near where other overlays/dialogs render in `App.tsx` (e.g., beside `CreateBudgetFlow`), add:

```tsx
{pendingConfirmBill && (
  <ConfirmBillDialog
    budget={pendingConfirmBill}
    accounts={accounts}
    onClose={() => setPendingConfirmBill(null)}
    onSkip={() => {
      // Advance to next pending commitment if any
      const remaining = budgetsWithSpending.filter(
        (b) => b.isPendingThisMonth && b.id !== pendingConfirmBill.id
      );
      setPendingConfirmBill(remaining[0] ?? null);
    }}
    onConfirm={async (txn, newLastConfirmedMonth) => {
      await addTransaction(txn);
      await editBudget(pendingConfirmBill.id, { lastConfirmedMonth: newLastConfirmedMonth });
      // Advance to next pending commitment if any
      const remaining = budgetsWithSpending.filter(
        (b) => b.isPendingThisMonth && b.id !== pendingConfirmBill.id
      );
      setPendingConfirmBill(remaining[0] ?? null);
    }}
  />
)}
```

Ensure `accounts` is destructured from `useAccounts()` in App.tsx. If there's no primary "name" field on `Account`, pass `accounts.map((a) => ({ id: a.id, name: a.name }))`.

- [ ] **Step 2: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: PASS.

Then `npm run dev`:
- Create a Meralco commitment budget with `dueDay` set to yesterday's day, `varies=true`.
- Go to Budgets — commitment card should show "Due today · tap to confirm" with amber PENDING pill.
- Tap the card — dialog opens. Estimate prefilled, date prefilled to due date.
- Change actual to a different amount (e.g., 3200), confirm.
- Verify a new expense transaction was created for 3200 on that date.
- Reopen the budget — verify `lastConfirmedMonth` is stamped.
- Budget card now shows "Paid ₱3,200 · next May..." with a PAID indicator.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(budgets): wire confirm-bill dialog to pending commitments"
```

---

## Task 11: HomeDashboard pending-bills banner

**Files:**
- Modify: `src/components/HomeDashboard.tsx`

- [ ] **Step 1: Find the insertion point**

Open `src/components/HomeDashboard.tsx` and read it. Identify the topmost element inside the main content container (above existing summary cards). The banner should render there, above the first existing element, only when there's at least one pending commitment.

- [ ] **Step 2: Add props**

Add to HomeDashboard's props interface:

```tsx
pendingCommitments: BudgetWithSpending[];
onConfirmCommitment: (budget: BudgetWithSpending) => void;
```

Import `BudgetWithSpending` from `../hooks/useBudgets`.

- [ ] **Step 3: Render the banner**

Near the top of the rendered JSX, before the first card:

```tsx
{pendingCommitments.length > 0 && (
  <button
    type="button"
    onClick={() => onConfirmCommitment(pendingCommitments[0]!)}
    className="w-full mb-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between text-left hover:bg-amber-500/15 transition-colors"
  >
    <div>
      <p className="text-sm font-semibold text-amber-700">
        {pendingCommitments.length === 1
          ? '1 bill needs confirmation'
          : `${pendingCommitments.length} bills need confirmation`}
      </p>
      <p className="text-xs text-amber-700/80 mt-0.5">
        {pendingCommitments[0]!.name}
        {pendingCommitments.length > 1 ? ` + ${pendingCommitments.length - 1} more` : ''}
      </p>
    </div>
    <span className="text-sm font-semibold text-amber-700">Review →</span>
  </button>
)}
```

- [ ] **Step 4: Pass props from App.tsx**

Where `<HomeDashboard ... />` is rendered in App.tsx, add:

```tsx
pendingCommitments={budgetsWithSpending.filter((b) => b.isPendingThisMonth === true)}
onConfirmCommitment={(b) => setPendingConfirmBill(b)}
```

- [ ] **Step 5: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: PASS.

Then `npm run dev`:
- Ensure at least one Meralco-style commitment is pending.
- Open Home tab — banner appears at the top with the count and first name.
- Tap banner — confirm dialog opens.
- Confirm the bill — banner count decrements (or disappears if that was the last one).

- [ ] **Step 6: Commit**

```bash
git add src/components/HomeDashboard.tsx src/App.tsx
git commit -m "feat(budgets): add pending-bills banner to dashboard"
```

---

## Self-Review Checklist

Before marking this plan complete, run these checks manually:

- [ ] Spec section "Data Model" → Task 1 covers new Budget fields.
- [ ] Spec section "Derivation: pending and next-due" → Tasks 2-5 cover `deriveCommitmentState` and integration.
- [ ] Spec section "Auto-confirm side effect" → Task 4 (plan) + Task 6 (execution).
- [ ] Spec section "Create Flow" → Task 7 covers commitment fields, header copy, and defaults.
- [ ] Spec section "Budget List & Cards" → Task 8 covers three-section split and commitment card states.
- [ ] Spec section "Confirm-Bill Dialog" → Task 9 (component) + Task 10 (wiring + skip/confirm advance).
- [ ] Spec section "Pending entry points" → Task 10 (card tap) + Task 11 (dashboard banner).
- [ ] Spec section "Migration" → editing pre-migration presets is covered by Task 7's `isCommitmentMode` logic that also checks `editingBudget.preset` against `COMMITMENT_PRESET_CATEGORIES`.
- [ ] Spec section "Edge Cases" — multi-month backfill covered in Task 4 tests; clamping in Task 2; timezone handled via ISO string comparison throughout.
- [ ] Spec section "Testing" — unit tests in Tasks 2-4 cover pure helpers; manual smoke covers auto-confirm (Task 6) and confirm-dialog (Task 10) flows. Integration test for the dialog is not strictly required per the spec and is omitted to keep scope tight.

---

## Out-of-Scope Reminders (do NOT implement)

- Push / notifications for pending bills.
- Multi-account bill splitting.
- Month-over-month bill comparisons.
- Commitment support on `type: 'category'` budgets.

If any of these feel needed mid-implementation, stop and raise them — they're future work.
