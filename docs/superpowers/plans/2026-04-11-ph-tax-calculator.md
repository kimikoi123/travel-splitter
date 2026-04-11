# PH Tax Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Philippine tax calculator tool that estimates SSS, PhilHealth, Pag-IBIG, withholding tax, and net take-home pay from a monthly gross salary input.

**Architecture:** Pure computation module (`src/utils/phTax.ts`) with rate constants centralized for easy updates. A full-screen calculator component (`PHTaxCalculator.tsx`) rendered as an overlay from `App.tsx`. Access point lives in a new "Tools" section inside the existing Settings screen.

**Tech Stack:** TypeScript, React 18, Vitest, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-11-ph-tax-calculator-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/utils/phTax.ts` | Create | Rate constants + `computePhTax(gross)` pure function |
| `src/utils/phTax.test.ts` | Create | Unit tests for bracket boundaries and sample calculations |
| `src/components/PHTaxCalculator.tsx` | Create | Full-screen calculator UI |
| `src/components/Settings.tsx` | Modify | Add "Tools" section with a row that opens the calculator |
| `src/App.tsx` | Modify | Overlay state + wiring between Settings and the calculator |

---

## Task 1: Computation Module (Core + SSS)

**Files:**
- Create: `src/utils/phTax.ts`
- Create: `src/utils/phTax.test.ts`

- [ ] **Step 1: Write the failing tests for SSS and the public contract**

Create `src/utils/phTax.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest';
import { computePhTax } from './phTax';

describe('computePhTax', () => {
  describe('zero and invalid input', () => {
    it('returns all zeros for gross of 0', () => {
      const r = computePhTax(0);
      expect(r.sss).toBe(0);
      expect(r.philHealth).toBe(0);
      expect(r.pagIbig).toBe(0);
      expect(r.totalContributions).toBe(0);
      expect(r.taxableIncome).toBe(0);
      expect(r.withholdingTax).toBe(0);
      expect(r.netTakeHome).toBe(0);
    });

    it('returns all zeros for negative gross', () => {
      const r = computePhTax(-1000);
      expect(r.sss).toBe(0);
      expect(r.netTakeHome).toBe(0);
    });

    it('returns all zeros for NaN gross', () => {
      const r = computePhTax(NaN);
      expect(r.sss).toBe(0);
    });
  });

  describe('SSS employee share', () => {
    it('clamps gross below floor to MSC 5000 (sss = 225)', () => {
      const r = computePhTax(4000);
      expect(r.sss).toBe(225);
    });

    it('computes 4.5% of MSC rounded down to nearest 500 at mid range (gross 27300 -> MSC 27000 -> 1215)', () => {
      const r = computePhTax(27300);
      expect(r.sss).toBe(1215);
    });

    it('clamps gross above ceiling to MSC 35000 (sss = 1575)', () => {
      const r = computePhTax(150000);
      expect(r.sss).toBe(1575);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- phTax`
Expected: FAIL — `Cannot find module './phTax'` (or equivalent).

- [ ] **Step 3: Create `phTax.ts` with the type, constants, SSS logic, and a stub for the rest**

Create `src/utils/phTax.ts`:

```ts
// UPDATED: 2026-04-11 — verify against
// https://www.bir.gov.ph/ (TRAIN law tax table, 2023+)
// https://www.sss.gov.ph/ (contribution schedule)
// https://www.philhealth.gov.ph/ (premium contribution table)
// https://www.pagibigfund.gov.ph/ (HDMF contribution rates)

export interface PhTaxBreakdown {
  sss: number;
  philHealth: number;
  pagIbig: number;
  totalContributions: number;
  taxableIncome: number;
  withholdingTax: number;
  netTakeHome: number;
}

const SSS_EMPLOYEE_RATE = 0.045;
const SSS_MSC_FLOOR = 5000;
const SSS_MSC_CEILING = 35000;
const SSS_MSC_STEP = 500;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeSss(gross: number): number {
  const stepped = Math.floor(gross / SSS_MSC_STEP) * SSS_MSC_STEP;
  const msc = clamp(stepped, SSS_MSC_FLOOR, SSS_MSC_CEILING);
  return round2(msc * SSS_EMPLOYEE_RATE);
}

const EMPTY: PhTaxBreakdown = {
  sss: 0,
  philHealth: 0,
  pagIbig: 0,
  totalContributions: 0,
  taxableIncome: 0,
  withholdingTax: 0,
  netTakeHome: 0,
};

export function computePhTax(monthlyGross: number): PhTaxBreakdown {
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) {
    return EMPTY;
  }

  const sss = computeSss(monthlyGross);

  return {
    sss,
    philHealth: 0,
    pagIbig: 0,
    totalContributions: sss,
    taxableIncome: 0,
    withholdingTax: 0,
    netTakeHome: 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify SSS tests pass**

Run: `npm test -- phTax`
Expected: The three SSS-specific tests and the zero/invalid-input tests pass. Other tests not yet written.

- [ ] **Step 5: Commit**

```bash
git add src/utils/phTax.ts src/utils/phTax.test.ts
git commit -m "feat(phTax): add computation module scaffold with SSS logic"
```

---

## Task 2: PhilHealth and Pag-IBIG

**Files:**
- Modify: `src/utils/phTax.ts`
- Modify: `src/utils/phTax.test.ts`

- [ ] **Step 1: Append PhilHealth and Pag-IBIG tests**

Add the following `describe` blocks at the bottom of the existing `describe('computePhTax', ...)` block in `src/utils/phTax.test.ts`, just before the final closing `});`:

```ts
  describe('PhilHealth employee share', () => {
    it('pins gross below 10000 to minimum 250', () => {
      const r = computePhTax(8000);
      expect(r.philHealth).toBe(250);
    });

    it('computes 2.5% at 30000 gross -> 750', () => {
      const r = computePhTax(30000);
      expect(r.philHealth).toBe(750);
    });

    it('pins gross above 100000 to maximum 2500', () => {
      const r = computePhTax(150000);
      expect(r.philHealth).toBe(2500);
    });
  });

  describe('Pag-IBIG employee share', () => {
    it('computes 2% at 8000 gross -> 160', () => {
      const r = computePhTax(8000);
      expect(r.pagIbig).toBe(160);
    });

    it('caps at 200 for gross of 10000', () => {
      const r = computePhTax(10000);
      expect(r.pagIbig).toBe(200);
    });

    it('caps at 200 for gross well above 10000', () => {
      const r = computePhTax(50000);
      expect(r.pagIbig).toBe(200);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- phTax`
Expected: PhilHealth and Pag-IBIG tests fail — all values return 0.

- [ ] **Step 3: Add PhilHealth and Pag-IBIG logic to `phTax.ts`**

In `src/utils/phTax.ts`, add these constants after the SSS constants:

```ts
const PHILHEALTH_RATE = 0.025;
const PHILHEALTH_FLOOR_SALARY = 10000;
const PHILHEALTH_CEILING_SALARY = 100000;

const PAGIBIG_RATE = 0.02;
const PAGIBIG_CAP = 200;
```

Add these helper functions after `computeSss`:

```ts
function computePhilHealth(gross: number): number {
  const base = clamp(gross, PHILHEALTH_FLOOR_SALARY, PHILHEALTH_CEILING_SALARY);
  return round2(base * PHILHEALTH_RATE);
}

function computePagIbig(gross: number): number {
  return round2(Math.min(gross * PAGIBIG_RATE, PAGIBIG_CAP));
}
```

Replace the body of `computePhTax` with:

```ts
export function computePhTax(monthlyGross: number): PhTaxBreakdown {
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) {
    return EMPTY;
  }

  const sss = computeSss(monthlyGross);
  const philHealth = computePhilHealth(monthlyGross);
  const pagIbig = computePagIbig(monthlyGross);
  const totalContributions = round2(sss + philHealth + pagIbig);

  return {
    sss,
    philHealth,
    pagIbig,
    totalContributions,
    taxableIncome: 0,
    withholdingTax: 0,
    netTakeHome: 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- phTax`
Expected: All PhilHealth and Pag-IBIG tests pass. Taxable income / withholding / net take-home tests still not written.

- [ ] **Step 5: Commit**

```bash
git add src/utils/phTax.ts src/utils/phTax.test.ts
git commit -m "feat(phTax): add PhilHealth and Pag-IBIG computation"
```

---

## Task 3: Withholding Tax and Net Take-Home

**Files:**
- Modify: `src/utils/phTax.ts`
- Modify: `src/utils/phTax.test.ts`

- [ ] **Step 1: Append withholding tax and integration tests**

Add this `describe` block at the bottom of the existing `describe('computePhTax', ...)` block in `src/utils/phTax.test.ts`, just before the final closing `});`:

```ts
  describe('withholding tax (TRAIN law, 2023+)', () => {
    it('low gross yields annual taxable under 250000 -> tax 0', () => {
      // Gross 20000: SSS 900, PhilHealth 500, Pag-IBIG 200 -> total 1600
      // Monthly taxable 18400, annual 220800 (bracket 1) -> 0
      const r = computePhTax(20000);
      expect(r.withholdingTax).toBe(0);
    });
  });

  describe('end-to-end sample: gross 50000', () => {
    // SSS: MSC 35000 * 0.045 = 1575
    // PhilHealth: 50000 * 0.025 = 1250
    // Pag-IBIG: min(50000 * 0.02, 200) = 200
    // Total contributions: 3025
    // Monthly taxable: 46975
    // Annual taxable: 563700
    // Bracket 3 (400k-800k): 22500 + 20% * (563700 - 400000) = 22500 + 32740 = 55240
    // Monthly tax: 55240 / 12 = 4603.33
    // Net: 50000 - 3025 - 4603.33 = 42371.67
    it('matches hand-verified breakdown', () => {
      const r = computePhTax(50000);
      expect(r.sss).toBe(1575);
      expect(r.philHealth).toBe(1250);
      expect(r.pagIbig).toBe(200);
      expect(r.totalContributions).toBe(3025);
      expect(r.taxableIncome).toBe(46975);
      expect(r.withholdingTax).toBe(4603.33);
      expect(r.netTakeHome).toBe(42371.67);
    });
  });

  describe('bracket boundaries', () => {
    it('very high gross lands in bracket 6 (35%)', () => {
      // Gross 1,000,000/month:
      // SSS 1575, PhilHealth 2500, Pag-IBIG 200 -> total 4275
      // Monthly taxable 995725, annual 11948700
      // Bracket 6: 2202500 + 35% * (11948700 - 8000000) = 2202500 + 1382045 = 3584545
      // Monthly: 298712.08
      const r = computePhTax(1000000);
      expect(r.withholdingTax).toBe(298712.08);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- phTax`
Expected: End-to-end and bracket boundary tests fail — `withholdingTax` still 0.

- [ ] **Step 3: Add bracket table and withholding logic to `phTax.ts`**

In `src/utils/phTax.ts`, add after the Pag-IBIG constants:

```ts
interface TaxBracket {
  upTo: number;      // annual taxable income upper bound (exclusive); Infinity for top bracket
  base: number;     // flat tax at the start of this bracket
  rate: number;     // marginal rate on excess over `over`
  over: number;     // threshold the marginal rate applies to
}

const BIR_ANNUAL_BRACKETS: TaxBracket[] = [
  { upTo: 250000,   base: 0,       rate: 0,    over: 0 },
  { upTo: 400000,   base: 0,       rate: 0.15, over: 250000 },
  { upTo: 800000,   base: 22500,   rate: 0.20, over: 400000 },
  { upTo: 2000000,  base: 102500,  rate: 0.25, over: 800000 },
  { upTo: 8000000,  base: 402500,  rate: 0.30, over: 2000000 },
  { upTo: Infinity, base: 2202500, rate: 0.35, over: 8000000 },
];
```

Add this helper after `computePagIbig`:

```ts
function computeAnnualIncomeTax(annualTaxable: number): number {
  if (annualTaxable <= 0) return 0;
  for (const bracket of BIR_ANNUAL_BRACKETS) {
    if (annualTaxable <= bracket.upTo) {
      return bracket.base + (annualTaxable - bracket.over) * bracket.rate;
    }
  }
  return 0;
}
```

Replace the body of `computePhTax` with the final version:

```ts
export function computePhTax(monthlyGross: number): PhTaxBreakdown {
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) {
    return EMPTY;
  }

  const sss = computeSss(monthlyGross);
  const philHealth = computePhilHealth(monthlyGross);
  const pagIbig = computePagIbig(monthlyGross);
  const totalContributions = round2(sss + philHealth + pagIbig);

  const taxableIncome = round2(monthlyGross - totalContributions);
  const annualTaxable = taxableIncome * 12;
  const withholdingTax = round2(computeAnnualIncomeTax(annualTaxable) / 12);
  const netTakeHome = round2(monthlyGross - totalContributions - withholdingTax);

  return {
    sss,
    philHealth,
    pagIbig,
    totalContributions,
    taxableIncome,
    withholdingTax,
    netTakeHome,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- phTax`
Expected: All tests pass.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/phTax.ts src/utils/phTax.test.ts
git commit -m "feat(phTax): add BIR withholding tax and net take-home computation"
```

---

## Task 4: PHTaxCalculator Component

**Files:**
- Create: `src/components/PHTaxCalculator.tsx`

- [ ] **Step 1: Create the calculator component**

Create `src/components/PHTaxCalculator.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { computePhTax } from '../utils/phTax';

interface PHTaxCalculatorProps {
  onBack: () => void;
}

function formatPhp(n: number): string {
  return n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PHTaxCalculator({ onBack }: PHTaxCalculatorProps) {
  const [grossInput, setGrossInput] = useState('');

  const gross = useMemo(() => {
    const parsed = parseFloat(grossInput.replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [grossInput]);

  const breakdown = useMemo(() => computePhTax(gross), [gross]);
  const hasResult = gross > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/30 bg-bg">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="p-2 -ml-2 rounded-lg text-text-primary hover:bg-surface-light transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold text-text-primary">PH Tax Calculator</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          {/* Amount input */}
          <div className="flex flex-col items-center py-8 px-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary mb-3">
              Monthly Gross Salary (PHP)
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={grossInput}
              onChange={(e) => setGrossInput(e.target.value)}
              aria-label="Monthly gross salary"
              className="w-full text-7xl md:text-8xl lg:text-9xl font-bold text-text-primary text-center bg-transparent border-none outline-none placeholder:text-text-secondary/30 tracking-tight"
              autoFocus
            />
          </div>

          {/* Results */}
          {hasResult && (
            <div className="px-4 pb-6">
              <section className="bg-surface rounded-2xl border border-border overflow-hidden">
                <Row label="SSS" value={breakdown.sss} />
                <Row label="PhilHealth" value={breakdown.philHealth} />
                <Row label="Pag-IBIG" value={breakdown.pagIbig} />
                <Row label="Total Contributions" value={breakdown.totalContributions} subtle />
                <Row label="Taxable Income" value={breakdown.taxableIncome} />
                <Row label="Withholding Tax" value={breakdown.withholdingTax} />
                <div className="flex justify-between items-center px-4 py-4 bg-primary/10">
                  <span className="text-sm font-semibold text-text-primary">Net Take-Home</span>
                  <span className="text-xl font-bold text-primary">
                    ₱ {formatPhp(breakdown.netTakeHome)}
                  </span>
                </div>
              </section>

              <p className="text-[11px] text-text-secondary mt-4 px-1 leading-relaxed">
                Based on current BIR / SSS / PhilHealth / Pag-IBIG rates. For estimation only — verify against your official payslip.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  subtle?: boolean;
}

function Row({ label, value, subtle }: RowProps) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-border last:border-b-0">
      <span className={`text-sm ${subtle ? 'text-text-secondary' : 'text-text-primary'}`}>
        {label}
      </span>
      <span className={`text-sm ${subtle ? 'text-text-secondary' : 'text-text-primary font-medium'}`}>
        ₱ {formatPhp(value)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck to verify the component compiles**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PHTaxCalculator.tsx
git commit -m "feat(phTax): add PHTaxCalculator component"
```

---

## Task 5: Wire Calculator into Settings

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Add the `onOpenTaxCalculator` prop and Tools section**

In `src/components/Settings.tsx`:

1. Add `Calculator` to the lucide-react import at line 2:

Replace:
```ts
import { Sun, Moon, Monitor, Download, Upload, EyeOff } from 'lucide-react';
```
with:
```ts
import { Sun, Moon, Monitor, Download, Upload, EyeOff, Calculator, ChevronRight } from 'lucide-react';
```

2. Add `onOpenTaxCalculator` to the `SettingsProps` interface. Replace:
```ts
interface SettingsProps {
  preferences: UserPreferences;
  onUpdate: (updates: Partial<UserPreferences>) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onExport: () => void;
  onImport: (json: string) => boolean;
  onBack: () => void;
  privacyMode?: boolean;
  onTogglePrivacy?: () => void;
}
```
with:
```ts
interface SettingsProps {
  preferences: UserPreferences;
  onUpdate: (updates: Partial<UserPreferences>) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onExport: () => void;
  onImport: (json: string) => boolean;
  onBack: () => void;
  privacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onOpenTaxCalculator: () => void;
}
```

3. Destructure the new prop in the component signature. Replace:
```ts
export default function Settings({
  preferences,
  onUpdate,
  theme,
  onThemeChange,
  onExport,
  onImport,
  privacyMode,
  onTogglePrivacy,
}: SettingsProps) {
```
with:
```ts
export default function Settings({
  preferences,
  onUpdate,
  theme,
  onThemeChange,
  onExport,
  onImport,
  privacyMode,
  onTogglePrivacy,
  onOpenTaxCalculator,
}: SettingsProps) {
```

4. Insert a new Tools section immediately before the `{/* Data Section */}` comment (around line 301). Add:
```tsx
        {/* Tools Section */}
        <section>
          <h2 className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider mb-2 px-1">
            Tools
          </h2>
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={onOpenTaxCalculator}
              className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-surface-light transition-colors"
            >
              <div className="flex items-center gap-3">
                <Calculator size={18} className="text-text-secondary" />
                <span className="text-sm text-text-primary">PH Tax Calculator</span>
              </div>
              <ChevronRight size={16} className="text-text-secondary" />
            </button>
          </div>
        </section>

```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Expect ONE error: `App.tsx` does not pass `onOpenTaxCalculator`. This is expected — it's wired in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(settings): add Tools section with PH Tax Calculator entry"
```

---

## Task 6: Wire Calculator into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the calculator**

In `src/App.tsx`, add after the existing `import SettingsScreen from './components/Settings';` line (around line 43):

```ts
import PHTaxCalculator from './components/PHTaxCalculator';
```

- [ ] **Step 2: Add the overlay state**

In `src/App.tsx`, add the new state immediately after the existing `const [showSettings, setShowSettings] = useState(false);` line (around line 119):

```ts
const [showTaxCalculator, setShowTaxCalculator] = useState(false);
```

- [ ] **Step 3: Pass the opener into Settings**

In `src/App.tsx`, find the `<SettingsScreen ... />` invocation (around line 398) and add the `onOpenTaxCalculator` prop. Replace:

```tsx
        {showSettings && (
          <SettingsScreen
            preferences={preferences}
            onUpdate={updatePreferences}
            theme={theme}
            onThemeChange={setTheme}
            onExport={exportData}
            onImport={importData}
            onBack={() => setShowSettings(false)}
            privacyMode={privacyMode}
            onTogglePrivacy={togglePrivacyMode}
          />
        )}
```
with:
```tsx
        {showSettings && (
          <SettingsScreen
            preferences={preferences}
            onUpdate={updatePreferences}
            theme={theme}
            onThemeChange={setTheme}
            onExport={exportData}
            onImport={importData}
            onBack={() => setShowSettings(false)}
            privacyMode={privacyMode}
            onTogglePrivacy={togglePrivacyMode}
            onOpenTaxCalculator={() => setShowTaxCalculator(true)}
          />
        )}
        {showTaxCalculator && (
          <div className="fixed inset-0 z-50 bg-bg">
            <PHTaxCalculator onBack={() => setShowTaxCalculator(false)} />
          </div>
        )}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS — all existing tests plus the new `phTax` tests.

- [ ] **Step 6: Run build to verify nothing breaks**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`
Open the app in a browser. Navigate to Settings → Tools → PH Tax Calculator. Enter `50000`. Verify:
- SSS: ₱ 1,575.00
- PhilHealth: ₱ 1,250.00
- Pag-IBIG: ₱ 200.00
- Total Contributions: ₱ 3,025.00
- Taxable Income: ₱ 46,975.00
- Withholding Tax: ₱ 4,603.33
- Net Take-Home: ₱ 42,371.67

Press back — returns to Settings with Settings still open. Open again, clear the input — results hide.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire PH Tax Calculator overlay from Settings"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npm test` → all tests pass
- [ ] `npm run typecheck` → no errors
- [ ] `npm run build` → succeeds
- [ ] Manual smoke test: ₱50,000 gross produces the expected breakdown
- [ ] Back navigation returns to Settings
- [ ] Empty / zero / negative input hides results cleanly
