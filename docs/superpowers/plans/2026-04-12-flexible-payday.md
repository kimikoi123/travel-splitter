# Flexible Pay Frequency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single monthly payday with a flexible frequency system supporting monthly, semi-monthly, biweekly, and weekly pay schedules.

**Architecture:** Add a discriminated union `PaydayConfig` type to `UserPreferences`, replacing the flat `paydayDay/paydayAmount/paydayCurrency` fields. Auto-migrate old data on load. Update forecast generation and dashboard countdown to handle all frequency variants.

**Tech Stack:** React, TypeScript, Vitest, Dexie (IndexedDB)

**Spec:** `docs/superpowers/specs/2026-04-12-flexible-payday-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | `PaydayConfig` union types + updated `UserPreferences` |
| `src/utils/payday.ts` | **New.** Pure helper functions: `getPaydayOccurrences`, `getNearestPayday` |
| `src/utils/payday.test.ts` | **New.** Tests for all payday helpers |
| `src/utils/forecast.ts` | Updated `computeTimeline` to use `PaydayConfig` via helpers |
| `src/hooks/useUserPreferences.ts` | Migration logic for old → new format |
| `src/components/Settings.tsx` | Frequency selector + conditional field rendering |
| `src/components/HomeDashboard.tsx` | Updated payday countdown using helpers |
| `src/components/CashflowForecast.tsx` | Pass `paydayConfig` instead of flat fields |
| `src/App.tsx` | Pass `paydayConfig` instead of flat fields |

---

### Task 1: Add PaydayConfig types

**Files:**
- Modify: `src/types.ts:157-170`

- [ ] **Step 1: Add the PaydayConfig discriminated union types above UserPreferences**

In `src/types.ts`, add after the `ThemePreference` type (line 157) and before `UserPreferences` (line 159):

```ts
export type PaydayFrequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly';

export interface PaydayConfigMonthly {
  frequency: 'monthly';
  day: number;
  amount: number;
  currency: string;
}

export interface PaydayConfigSemiMonthly {
  frequency: 'semi-monthly';
  day1: number;
  amount1: number;
  day2: number;
  amount2: number;
  currency: string;
}

export interface PaydayConfigBiweekly {
  frequency: 'biweekly';
  refDate: string;
  amount: number;
  currency: string;
}

export interface PaydayConfigWeekly {
  frequency: 'weekly';
  refDate: string;
  amount: number;
  currency: string;
}

export type PaydayConfig =
  | PaydayConfigMonthly
  | PaydayConfigSemiMonthly
  | PaydayConfigBiweekly
  | PaydayConfigWeekly;
```

- [ ] **Step 2: Update UserPreferences to use PaydayConfig**

Replace the three flat payday fields in `UserPreferences`:

```ts
export interface UserPreferences {
  id: string;
  displayName: string;
  defaultCurrency: string;
  theme: ThemePreference;
  onboardingComplete: boolean;
  paydayConfig?: PaydayConfig;
  privacyMode?: boolean;
  updatedAt?: number;
}
```

- [ ] **Step 3: Run typecheck to see what breaks**

Run: `npx tsc --noEmit 2>&1 | head -60`

Expected: Type errors in Settings.tsx, HomeDashboard.tsx, CashflowForecast.tsx, App.tsx, and forecast.ts referencing the removed `paydayDay`, `paydayAmount`, `paydayCurrency` fields. This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add PaydayConfig discriminated union, replace flat payday fields"
```

---

### Task 2: Create payday helper functions with tests

**Files:**
- Create: `src/utils/payday.ts`
- Create: `src/utils/payday.test.ts`

- [ ] **Step 1: Write failing tests for `getPaydayOccurrences`**

Create `src/utils/payday.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPaydayOccurrences, getNearestPayday } from './payday';
import type {
  PaydayConfigMonthly,
  PaydayConfigSemiMonthly,
  PaydayConfigBiweekly,
  PaydayConfigWeekly,
} from '../types';

function day(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('getPaydayOccurrences', () => {
  describe('monthly', () => {
    const config: PaydayConfigMonthly = { frequency: 'monthly', day: 15, amount: 10000, currency: 'PHP' };

    it('returns one occurrence when payday falls within window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 1), day(2026, 4, 30));
      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(day(2026, 4, 15));
      expect(result[0].amount).toBe(10000);
    });

    it('returns two occurrences when window spans two months', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 1), day(2026, 5, 31));
      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(day(2026, 4, 15));
      expect(result[1].date).toEqual(day(2026, 5, 15));
    });

    it('returns empty when payday is before window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 16), day(2026, 4, 30));
      expect(result).toHaveLength(0);
    });
  });

  describe('semi-monthly', () => {
    const config: PaydayConfigSemiMonthly = {
      frequency: 'semi-monthly', day1: 15, amount1: 12000, day2: 30, amount2: 15000, currency: 'PHP',
    };

    it('returns both paydays within a full month window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 1), day(2026, 4, 30));
      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(day(2026, 4, 15));
      expect(result[0].amount).toBe(12000);
      expect(result[1].date).toEqual(day(2026, 4, 30));
      expect(result[1].amount).toBe(15000);
    });

    it('returns only the one that falls in a partial window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 20), day(2026, 4, 30));
      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(day(2026, 4, 30));
    });
  });

  describe('biweekly', () => {
    const config: PaydayConfigBiweekly = {
      frequency: 'biweekly', refDate: '2026-04-03', amount: 8000, currency: 'PHP',
    };

    it('returns occurrences every 14 days from refDate within window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 1), day(2026, 5, 1));
      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(day(2026, 4, 3));
      expect(result[1].date).toEqual(day(2026, 4, 17));
    });

    it('works when refDate is in the past', () => {
      const result = getPaydayOccurrences(config, day(2026, 5, 1), day(2026, 5, 31));
      // 2026-04-03 + 4*14 = 2026-05-29, +3*14 = 2026-05-15
      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(day(2026, 5, 15));
      expect(result[1].date).toEqual(day(2026, 5, 29));
    });
  });

  describe('weekly', () => {
    const config: PaydayConfigWeekly = {
      frequency: 'weekly', refDate: '2026-04-03', amount: 4000, currency: 'PHP',
    };

    it('returns occurrences every 7 days from refDate within window', () => {
      const result = getPaydayOccurrences(config, day(2026, 4, 1), day(2026, 4, 30));
      expect(result).toHaveLength(4);
      expect(result[0].date).toEqual(day(2026, 4, 3));
      expect(result[1].date).toEqual(day(2026, 4, 10));
      expect(result[2].date).toEqual(day(2026, 4, 17));
      expect(result[3].date).toEqual(day(2026, 4, 24));
    });
  });
});

describe('getNearestPayday', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns nearest payday for monthly config', () => {
    vi.useFakeTimers({ now: day(2026, 4, 10) });
    const config: PaydayConfigMonthly = { frequency: 'monthly', day: 15, amount: 10000, currency: 'PHP' };
    const result = getNearestPayday(config);
    expect(result).not.toBeNull();
    expect(result!.date).toEqual(day(2026, 4, 15));
    expect(result!.amount).toBe(10000);
    expect(result!.daysUntil).toBe(5);
  });

  it('returns the closer of two semi-monthly paydays', () => {
    vi.useFakeTimers({ now: day(2026, 4, 20) });
    const config: PaydayConfigSemiMonthly = {
      frequency: 'semi-monthly', day1: 15, amount1: 12000, day2: 30, amount2: 15000, currency: 'PHP',
    };
    const result = getNearestPayday(config);
    expect(result).not.toBeNull();
    expect(result!.date).toEqual(day(2026, 4, 30));
    expect(result!.amount).toBe(15000);
    expect(result!.daysUntil).toBe(10);
  });

  it('returns nearest biweekly payday', () => {
    vi.useFakeTimers({ now: day(2026, 4, 10) });
    const config: PaydayConfigBiweekly = {
      frequency: 'biweekly', refDate: '2026-04-03', amount: 8000, currency: 'PHP',
    };
    const result = getNearestPayday(config);
    expect(result).not.toBeNull();
    expect(result!.date).toEqual(day(2026, 4, 17));
    expect(result!.amount).toBe(8000);
    expect(result!.daysUntil).toBe(7);
  });

  it('returns null when config is undefined', () => {
    const result = getNearestPayday(undefined);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/payday.test.ts 2>&1 | tail -20`
Expected: FAIL — module `./payday` not found.

- [ ] **Step 3: Implement the payday helpers**

Create `src/utils/payday.ts`:

```ts
import type { PaydayConfig } from '../types';

export interface PaydayOccurrence {
  date: Date;
  amount: number;
  currency: string;
}

export interface NearestPaydayInfo {
  date: Date;
  amount: number;
  currency: string;
  daysUntil: number;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function monthlyOccurrences(day: number, amount: number, currency: string, start: Date, end: Date): PaydayOccurrence[] {
  const results: PaydayOccurrence[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  for (let i = 0; i < 14; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + i;
    const maxDay = new Date(y, m + 1, 0).getDate();
    const clamped = Math.min(day, maxDay);
    const d = new Date(y, m, clamped);
    d.setHours(0, 0, 0, 0);
    if (d > end) break;
    if (d >= start) results.push({ date: d, amount, currency });
  }
  return results;
}

function intervalOccurrences(refDateStr: string, stepDays: number, amount: number, currency: string, start: Date, end: Date): PaydayOccurrence[] {
  const ref = startOfDay(new Date(refDateStr));
  const results: PaydayOccurrence[] = [];
  const msStep = stepDays * 86400000;

  let cursor: Date;
  if (ref >= start) {
    cursor = ref;
  } else {
    const gap = Math.floor((start.getTime() - ref.getTime()) / msStep);
    cursor = new Date(ref.getTime() + gap * msStep);
    if (cursor < start) cursor = new Date(cursor.getTime() + msStep);
  }

  for (let i = 0; i < 53; i++) {
    const d = new Date(cursor.getTime() + i * msStep);
    d.setHours(0, 0, 0, 0);
    if (d > end) break;
    if (d >= start) results.push({ date: d, amount, currency });
  }
  return results;
}

export function getPaydayOccurrences(config: PaydayConfig, windowStart: Date, windowEnd: Date): PaydayOccurrence[] {
  switch (config.frequency) {
    case 'monthly':
      return monthlyOccurrences(config.day, config.amount, config.currency, windowStart, windowEnd);
    case 'semi-monthly': {
      const occ1 = monthlyOccurrences(config.day1, config.amount1, config.currency, windowStart, windowEnd);
      const occ2 = monthlyOccurrences(config.day2, config.amount2, config.currency, windowStart, windowEnd);
      return [...occ1, ...occ2].sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    case 'biweekly':
      return intervalOccurrences(config.refDate, 14, config.amount, config.currency, windowStart, windowEnd);
    case 'weekly':
      return intervalOccurrences(config.refDate, 7, config.amount, config.currency, windowStart, windowEnd);
  }
}

export function getNearestPayday(config: PaydayConfig | undefined): NearestPaydayInfo | null {
  if (!config) return null;
  const today = startOfDay(new Date());
  const farFuture = new Date(today);
  farFuture.setFullYear(farFuture.getFullYear() + 1);
  const occurrences = getPaydayOccurrences(config, today, farFuture);
  if (occurrences.length === 0) return null;
  const nearest = occurrences[0];
  const daysUntil = Math.round((nearest.date.getTime() - today.getTime()) / 86400000);
  return { date: nearest.date, amount: nearest.amount, currency: nearest.currency, daysUntil };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/payday.test.ts 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/payday.ts src/utils/payday.test.ts
git commit -m "feat(payday): add helper functions for all pay frequencies with tests"
```

---

### Task 3: Update forecast to use PaydayConfig

**Files:**
- Modify: `src/utils/forecast.ts:1-2, 250-313`

- [ ] **Step 1: Update computeTimeline signature and payday section**

In `src/utils/forecast.ts`:

Add import at top (line 1):
```ts
import type { Transaction, Installment, DebtEntry, Account, ExchangeRates, RecurringFrequency, PaydayConfig } from '../types';
import { getFinanceCategoryDef } from './categories';
import { convertToBase } from './currencies';
import { getPaydayOccurrences } from './payday';
```

Replace the `computeTimeline` params (lines 250-273) — change the three flat payday fields to `paydayConfig`:
```ts
export function computeTimeline(params: {
  transactions: Transaction[];
  paydayConfig?: PaydayConfig;
  installments: Installment[];
  debts: DebtEntry[];
  accounts: Account[];
  defaultCurrency: string;
  exchangeRates: ExchangeRates | null;
  windowDays?: number;
}): ForecastTimeline {
  const {
    transactions,
    paydayConfig,
    installments,
    debts,
    accounts,
    defaultCurrency,
    exchangeRates,
    windowDays = 30,
  } = params;
```

Replace the payday section (old lines 299-313) with:
```ts
  // 2. Payday
  if (paydayConfig) {
    const occurrences = getPaydayOccurrences(paydayConfig, today, endDate);
    for (const occ of occurrences) {
      events.push({
        id: `payday-${dateKey(occ.date)}`,
        date: occ.date,
        description: 'Payday',
        amount: occ.amount,
        currency: occ.currency,
        source: 'payday',
        emoji: '💰',
      });
    }
  }
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: Errors remain in App.tsx, CashflowForecast.tsx, HomeDashboard.tsx, Settings.tsx (these still reference old flat fields). forecast.ts should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/utils/forecast.ts
git commit -m "feat(forecast): use PaydayConfig for multi-frequency payday events"
```

---

### Task 4: Add migration in useUserPreferences

**Files:**
- Modify: `src/hooks/useUserPreferences.ts`

- [ ] **Step 1: Add migration logic to the refresh callback**

Replace the full file `src/hooks/useUserPreferences.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import type { UserPreferences, PaydayConfigMonthly } from '../types';
import { loadUserPreferences, saveUserPreferences } from '../db/storage';
import { useRefreshOnRemote } from './useRefreshOnRemote';

const DEFAULT_PREFERENCES: UserPreferences = {
  id: 'default',
  displayName: '',
  defaultCurrency: 'PHP',
  theme: 'system',
  onboardingComplete: false,
};

function migratePayday(prefs: Record<string, unknown>): boolean {
  if (prefs.paydayDay != null && prefs.paydayConfig == null) {
    const config: PaydayConfigMonthly = {
      frequency: 'monthly',
      day: prefs.paydayDay as number,
      amount: (prefs.paydayAmount as number) ?? 0,
      currency: (prefs.paydayCurrency as string) ?? 'PHP',
    };
    (prefs as Record<string, unknown>).paydayConfig = config;
    delete prefs.paydayDay;
    delete prefs.paydayAmount;
    delete prefs.paydayCurrency;
    return true;
  }
  return false;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const prefs = await loadUserPreferences();
    if (prefs) {
      const raw = prefs as unknown as Record<string, unknown>;
      if (migratePayday(raw)) {
        const migrated = raw as unknown as UserPreferences;
        await saveUserPreferences(migrated);
        setPreferences(migrated);
      } else {
        setPreferences(prefs);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRefreshOnRemote(refresh);

  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...updates, id: 'default' } as UserPreferences;
    setPreferences(updated);
    await saveUserPreferences(updated);
    return updated;
  }, [preferences]);

  return { preferences, loading, updatePreferences };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUserPreferences.ts
git commit -m "feat(prefs): auto-migrate flat payday fields to PaydayConfig on load"
```

---

### Task 5: Update CashflowForecast component

**Files:**
- Modify: `src/components/CashflowForecast.tsx:1-18, 120-145`

- [ ] **Step 1: Update imports, props, and computeTimeline call**

Update import (line 3):
```ts
import type { Transaction, Installment, DebtEntry, Account, ExchangeRates, PaydayConfig } from '../types';
```

Replace the three flat payday props in the interface (lines 7-18):
```ts
interface CashflowForecastProps {
  transactions: Transaction[];
  installments: Installment[];
  debts: DebtEntry[];
  accounts: Account[];
  defaultCurrency: string;
  paydayConfig?: PaydayConfig;
  exchangeRates: ExchangeRates | null;
  onBack: () => void;
}
```

Update the component destructuring and computeTimeline call (lines 120-145):
```ts
export default function CashflowForecast({
  transactions,
  installments,
  debts,
  accounts,
  defaultCurrency,
  paydayConfig,
  exchangeRates,
  onBack,
}: CashflowForecastProps) {
  const timeline = useMemo(
    () =>
      computeTimeline({
        transactions,
        paydayConfig,
        installments,
        debts,
        accounts,
        defaultCurrency,
        exchangeRates,
      }),
    [transactions, paydayConfig, installments, debts, accounts, defaultCurrency, exchangeRates],
  );
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CashflowForecast.tsx
git commit -m "feat(cashflow): pass PaydayConfig instead of flat payday fields"
```

---

### Task 6: Update HomeDashboard component

**Files:**
- Modify: `src/components/HomeDashboard.tsx:1-19, 53-61, 164-184, 314-347`

- [ ] **Step 1: Update imports and props**

Add import (line 1 area):
```ts
import type { Transaction, PaydayConfig } from '../types';
```

Replace the flat payday props in the interface:
```ts
interface HomeDashboardProps {
  displayName: string;
  transactions: Transaction[];
  defaultCurrency: string;
  paydayConfig?: PaydayConfig;
  onQuickAdd?: (parsed: ParsedTransaction) => void;
}
```

Update component destructuring:
```ts
export default function HomeDashboard({
  displayName,
  transactions,
  defaultCurrency,
  paydayConfig,
  onQuickAdd,
}: HomeDashboardProps) {
```

- [ ] **Step 2: Replace paydayInfo memo with getNearestPayday**

Add import at top:
```ts
import { getNearestPayday } from '../utils/payday';
```

Replace the `paydayInfo` memo (lines 164-184):
```ts
  const paydayInfo = useMemo(() => getNearestPayday(paydayConfig), [paydayConfig]);
```

- [ ] **Step 3: Update the payday countdown card JSX**

Replace the payday countdown section (lines 314-347). The old card references `paydayInfo.daysUntilPayday`, `paydayAmount`, `paydayCurrency`. Update to use the new shape:

```tsx
      {paydayInfo != null && (
        <div className="bg-surface rounded-2xl border border-border p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider">
                  DAYS UNTIL PAYDAY
                </p>
                {paydayInfo.daysUntil === 0 ? (
                  <p className="text-xl font-bold text-primary">Payday!</p>
                ) : (
                  <p className="text-xl font-bold text-text-primary">
                    {paydayInfo.daysUntil} day{paydayInfo.daysUntil !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-primary">
                {formatCurrency(paydayInfo.amount, paydayInfo.currency)}
              </p>
              <p className="text-xs text-text-secondary">
                {formatShortDate(paydayInfo.date)}
              </p>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/HomeDashboard.tsx
git commit -m "feat(dashboard): use getNearestPayday for flexible payday countdown"
```

---

### Task 7: Update App.tsx prop passing

**Files:**
- Modify: `src/App.tsx:418-427, 455-465`

- [ ] **Step 1: Update HomeDashboard props in App.tsx**

Find the HomeDashboard usage (around line 418-427) and replace the three flat payday props:

Old:
```tsx
            paydayDay={preferences.paydayDay}
            paydayAmount={preferences.paydayAmount}
            paydayCurrency={preferences.paydayCurrency}
```

New:
```tsx
            paydayConfig={preferences.paydayConfig}
```

- [ ] **Step 2: Update CashflowForecast props in App.tsx**

Find the CashflowForecast usage (around line 455-465) and replace the three flat payday props:

Old:
```tsx
              paydayDay={preferences.paydayDay}
              paydayAmount={preferences.paydayAmount}
              paydayCurrency={preferences.paydayCurrency}
```

New:
```tsx
              paydayConfig={preferences.paydayConfig}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: Only Settings.tsx errors remain (it still references old payday fields).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): pass paydayConfig to HomeDashboard and CashflowForecast"
```

---

### Task 8: Rewrite Settings payday section

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Update Settings to use PaydayConfig**

This is the largest UI change. Replace the payday-related state, handlers, and JSX in Settings.tsx.

Update imports (line 3):
```ts
import type { UserPreferences, ThemePreference, PaydayConfig, PaydayFrequency } from '../types';
```

Replace the payday error state (lines 40-41) with:
```ts
  const [paydayErrors, setPaydayErrors] = useState<Record<string, string | null>>({});
```

Remove the old handlers `handlePaydayDayBlur`, `handlePaydayAmountBlur`, `handlePaydayCurrencyChange` (lines 65-103).

Add new handlers after the `handleCurrencyChange` handler:

```ts
  const paydayConfig = preferences.paydayConfig;
  const paydayFrequency: PaydayFrequency = paydayConfig?.frequency ?? 'monthly';

  const handlePaydayFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const freq = e.target.value as PaydayFrequency;
    const currency = paydayConfig?.currency ?? preferences.defaultCurrency;
    let newConfig: PaydayConfig;
    switch (freq) {
      case 'monthly':
        newConfig = { frequency: 'monthly', day: 15, amount: 0, currency };
        break;
      case 'semi-monthly':
        newConfig = { frequency: 'semi-monthly', day1: 15, amount1: 0, day2: 30, amount2: 0, currency };
        break;
      case 'biweekly':
        newConfig = { frequency: 'biweekly', refDate: new Date().toISOString().slice(0, 10), amount: 0, currency };
        break;
      case 'weekly':
        newConfig = { frequency: 'weekly', refDate: new Date().toISOString().slice(0, 10), amount: 0, currency };
        break;
    }
    setPaydayErrors({});
    onUpdate({ paydayConfig: newConfig });
  };

  const updatePaydayField = (field: string, value: unknown) => {
    if (!paydayConfig) return;
    onUpdate({ paydayConfig: { ...paydayConfig, [field]: value } as PaydayConfig });
  };

  const handleDayBlur = (field: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setPaydayErrors(prev => ({ ...prev, [field]: null }));
      return;
    }
    const val = parseInt(raw, 10);
    if (isNaN(val) || val < 1 || val > 31) {
      setPaydayErrors(prev => ({ ...prev, [field]: 'Enter a day between 1 and 31.' }));
      return;
    }
    setPaydayErrors(prev => ({ ...prev, [field]: null }));
    updatePaydayField(field, val);
  };

  const handleAmountBlur = (field: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setPaydayErrors(prev => ({ ...prev, [field]: null }));
      return;
    }
    const val = parseFloat(raw);
    if (isNaN(val)) {
      setPaydayErrors(prev => ({ ...prev, [field]: 'Enter a valid amount.' }));
      return;
    }
    if (val <= 0) {
      setPaydayErrors(prev => ({ ...prev, [field]: 'Amount must be greater than 0.' }));
      return;
    }
    setPaydayErrors(prev => ({ ...prev, [field]: null }));
    updatePaydayField(field, val);
  };

  const handleRefDateChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePaydayField(field, e.target.value);
  };

  const handlePaydayCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updatePaydayField('currency', e.target.value);
  };
```

- [ ] **Step 2: Replace the Payday section JSX**

Replace the entire Payday section (lines 180-250) with:

```tsx
        {/* Payday Section */}
        <section>
          <h2 className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 px-1">
            Payday
          </h2>
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Frequency */}
            <div className="flex justify-between items-center py-3 px-4 border-b border-border">
              <span className="text-sm text-text-primary">Frequency</span>
              <select
                value={paydayFrequency}
                onChange={handlePaydayFrequencyChange}
                className="bg-surface border border-border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/40 transition-shadow appearance-none select-chevron"
              >
                <option value="monthly">Monthly</option>
                <option value="semi-monthly">Semi-monthly</option>
                <option value="biweekly">Biweekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {/* Monthly fields */}
            {paydayConfig?.frequency === 'monthly' && (
              <>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Day of month</span>
                    <input type="number" min={1} max={31} defaultValue={paydayConfig.day || ''} placeholder="15" onBlur={handleDayBlur('day')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-24 text-right placeholder:text-text-secondary/50 ${paydayErrors.day ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.day && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.day}</p>}
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Amount</span>
                    <input type="number" min={0} step="0.01" defaultValue={paydayConfig.amount || ''} placeholder="0.00" onBlur={handleAmountBlur('amount')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-32 text-right placeholder:text-text-secondary/50 ${paydayErrors.amount ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.amount && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.amount}</p>}
                </div>
              </>
            )}

            {/* Semi-monthly fields */}
            {paydayConfig?.frequency === 'semi-monthly' && (
              <>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">1st payday (day)</span>
                    <input type="number" min={1} max={31} defaultValue={paydayConfig.day1 || ''} placeholder="15" onBlur={handleDayBlur('day1')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-24 text-right placeholder:text-text-secondary/50 ${paydayErrors.day1 ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.day1 && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.day1}</p>}
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">1st payday amount</span>
                    <input type="number" min={0} step="0.01" defaultValue={paydayConfig.amount1 || ''} placeholder="0.00" onBlur={handleAmountBlur('amount1')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-32 text-right placeholder:text-text-secondary/50 ${paydayErrors.amount1 ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.amount1 && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.amount1}</p>}
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">2nd payday (day)</span>
                    <input type="number" min={1} max={31} defaultValue={paydayConfig.day2 || ''} placeholder="30" onBlur={handleDayBlur('day2')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-24 text-right placeholder:text-text-secondary/50 ${paydayErrors.day2 ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.day2 && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.day2}</p>}
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">2nd payday amount</span>
                    <input type="number" min={0} step="0.01" defaultValue={paydayConfig.amount2 || ''} placeholder="0.00" onBlur={handleAmountBlur('amount2')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-32 text-right placeholder:text-text-secondary/50 ${paydayErrors.amount2 ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.amount2 && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.amount2}</p>}
                </div>
              </>
            )}

            {/* Biweekly fields */}
            {paydayConfig?.frequency === 'biweekly' && (
              <>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Last payday date</span>
                    <input type="date" defaultValue={paydayConfig.refDate} onChange={handleRefDateChange('refDate')} className="bg-surface border border-border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/40 transition-shadow" />
                  </div>
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Amount</span>
                    <input type="number" min={0} step="0.01" defaultValue={paydayConfig.amount || ''} placeholder="0.00" onBlur={handleAmountBlur('amount')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-32 text-right placeholder:text-text-secondary/50 ${paydayErrors.amount ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.amount && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.amount}</p>}
                </div>
              </>
            )}

            {/* Weekly fields */}
            {paydayConfig?.frequency === 'weekly' && (
              <>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Last payday date</span>
                    <input type="date" defaultValue={paydayConfig.refDate} onChange={handleRefDateChange('refDate')} className="bg-surface border border-border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/40 transition-shadow" />
                  </div>
                </div>
                <div className="py-3 px-4 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-primary">Amount</span>
                    <input type="number" min={0} step="0.01" defaultValue={paydayConfig.amount || ''} placeholder="0.00" onBlur={handleAmountBlur('amount')} className={`bg-surface border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 transition-shadow w-32 text-right placeholder:text-text-secondary/50 ${paydayErrors.amount ? 'border-danger/60 focus:ring-danger/30' : 'border-border focus:ring-primary/40'}`} />
                  </div>
                  {paydayErrors.amount && <p className="text-xs text-danger mt-1.5 text-right">{paydayErrors.amount}</p>}
                </div>
              </>
            )}

            {/* Currency (shared across all frequencies) */}
            {paydayConfig && (
              <div className="flex justify-between items-center py-3 px-4">
                <span className="text-sm text-text-primary">Currency</span>
                <select
                  value={paydayConfig.currency ?? preferences.defaultCurrency}
                  onChange={handlePaydayCurrencyChange}
                  className="bg-surface border border-border rounded-xl py-2 px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/40 transition-shadow appearance-none select-chevron"
                >
                  {Object.entries(CURRENCIES).map(([code, config]) => (
                    <option key={code} value={code}>
                      {config.symbol} {code} — {config.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(settings): add frequency selector with conditional payday fields"
```

---

### Task 9: Final verification

**Files:** None (testing only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

Start the dev server with `npm run dev` and test in browser:
1. Open Settings → Payday section. Verify frequency dropdown shows "Monthly" by default.
2. Select "Semi-monthly" → verify Day 1, Amount 1, Day 2, Amount 2 fields appear.
3. Enter 15th / 12000 and 30th / 15000 → go to Home dashboard → verify countdown shows nearest payday.
4. Open Cashflow Forecast → verify both paydays appear in the timeline.
5. Switch to "Biweekly" → enter a reference date and amount → verify forecast shows events every 14 days.
6. Switch to "Weekly" → verify forecast shows events every 7 days.
7. If the user previously had a monthly payday set, verify it migrated correctly (shows as Monthly with the old values).
