# PH Tax Calculator — Design

**Date:** 2026-04-11
**Status:** Approved, pending implementation plan
**Scope:** Standalone tool for estimating Philippine monthly take-home pay from a gross salary input.

## Goal

Add a lightweight, standalone calculator that takes one input — monthly gross salary in PHP — and displays the estimated breakdown of mandatory deductions (SSS, PhilHealth, Pag-IBIG), withholding tax (TRAIN law), and net take-home pay. No persistence, no effect on transactions, accounts, or any other app state.

## Non-Goals

- Pay-frequency toggle (monthly / semi-monthly / bi-weekly).
- 13th-month pay, de minimis benefits, or non-taxable allowances.
- Overtime, night differential, bonuses.
- Multi-country tax support.
- Saving a "salary profile" that pre-fills income transactions.
- Historical tax rate selection — uses current rates only.

## Architecture

### File structure

| File | Purpose |
|---|---|
| `src/utils/phTax.ts` | Pure computation module. Rate constants and `computePhTax(gross)` function. |
| `src/utils/phTax.test.ts` | Unit tests for bracket boundaries and sample calculations. |
| `src/components/PHTaxCalculator.tsx` | Full-screen calculator view. |
| `src/components/Settings.tsx` | Add a new "Tools" section with a row that opens the calculator. |
| `src/App.tsx` | Add `showTaxCalculator` overlay state, wire Settings → Calculator navigation. |

### Computation module

Single exported function:

```ts
export interface PhTaxBreakdown {
  sss: number;              // employee monthly share
  philHealth: number;       // employee monthly share
  pagIbig: number;          // employee monthly share
  totalContributions: number;
  taxableIncome: number;    // monthly gross − total contributions
  withholdingTax: number;   // monthly (annualized then divided by 12)
  netTakeHome: number;
}

export function computePhTax(monthlyGross: number): PhTaxBreakdown;
```

All rates live in a single `const` table at the top of the file with a dated comment pointing at the authoritative sources:

```ts
// UPDATED: 2026-04-11 — verify against
// https://www.bir.gov.ph/ (TRAIN law tax table, 2023+)
// https://www.sss.gov.ph/ (contribution schedule)
// https://www.philhealth.gov.ph/ (premium contribution table)
// https://www.pagibigfund.gov.ph/ (HDMF contribution rates)
```

### Computation rules

**SSS (employee share):**
- Rate: 4.5% of Monthly Salary Credit (MSC).
- MSC clamped to `[5000, 35000]` in ₱500 steps.
- Implementation: `msc = clamp(round500(gross), 5000, 35000); sss = msc * 0.045`.

**PhilHealth (employee share):**
- Rate: 2.5% of monthly gross (half of 5% total premium).
- Floor: ₱10,000 → minimum ₱250.
- Ceiling: ₱100,000 → maximum ₱2,500.
- Implementation: `philHealth = clamp(gross, 10000, 100000) * 0.025`.

**Pag-IBIG (employee share):**
- Rate: 2% of monthly gross.
- Cap: ₱200 (based on ₱10,000 contribution ceiling).
- Implementation: `pagIbig = min(gross * 0.02, 200)`.

**Withholding tax (BIR, TRAIN law, 2023+):**
- `taxableIncome = gross − (sss + philHealth + pagIbig)`.
- Annualize: `annualTaxable = taxableIncome * 12`.
- Apply bracket table:

| Annual taxable income | Tax |
|---|---|
| ≤ ₱250,000 | 0 |
| ₱250,000 – ₱400,000 | 15% of excess over ₱250,000 |
| ₱400,000 – ₱800,000 | ₱22,500 + 20% of excess over ₱400,000 |
| ₱800,000 – ₱2,000,000 | ₱102,500 + 25% of excess over ₱800,000 |
| ₱2,000,000 – ₱8,000,000 | ₱402,500 + 30% of excess over ₱2,000,000 |
| > ₱8,000,000 | ₱2,202,500 + 35% of excess over ₱8,000,000 |

- Divide annual tax by 12 for monthly withholding.

**Net take-home:**
`netTakeHome = gross − totalContributions − withholdingTax`.

### Edge cases

- `gross <= 0` or non-numeric → return zeros across the breakdown; UI treats as "no input".
- Very large values → no upper bound beyond bracket math; bracket 6 handles it.
- Rounding: each component rounded to 2 decimal places at the boundary of the `computePhTax` return value. No intermediate rounding.

## UI

Full-screen overlay, matching the Settings navigation pattern (not a new tab).

**Header:** Back button + title "PH Tax Calculator".

**Input section:**
- Label: "Monthly Gross Salary"
- Large numeric input, reuses the oversized amount-input styling recently introduced in `TransactionForm` (`text-7xl md:text-8xl lg:text-9xl`).
- Fixed PHP — no currency selector.

**Results card** (below the input, hidden when input is empty or zero):
- SSS — ₱ amount
- PhilHealth — ₱ amount
- Pag-IBIG — ₱ amount
- Total Contributions — ₱ amount (subtotal line)
- Taxable Income — ₱ amount
- Withholding Tax — ₱ amount
- **Net Take-Home Pay** — highlighted row, larger type, primary color

**Footnote:**
"Based on current BIR/SSS/PhilHealth/Pag-IBIG rates. For estimation only — verify against your official payslip."

**No:** save buttons, export, history, toggles, or sliders.

## Integration

1. `App.tsx`: add `const [showTaxCalculator, setShowTaxCalculator] = useState(false)`.
2. When `showTaxCalculator` is true, render `<PHTaxCalculator onBack={() => setShowTaxCalculator(false)} />` above all other content.
3. `Settings.tsx`: add a new "Tools" section placed below the existing preference sections and above Data/Export, containing one row — "PH Tax Calculator" — with a chevron and an `onClick` that triggers the new overlay. Settings receives an `onOpenTaxCalculator` prop from `App.tsx`.
4. Closing the calculator returns the user to the Settings screen (Settings remains open underneath).

## Testing

`phTax.test.ts` covers:
- Gross = 0 → all zeros.
- Gross below PhilHealth floor (e.g., ₱8,000) → PhilHealth pinned to ₱250.
- Gross above PhilHealth ceiling (e.g., ₱150,000) → PhilHealth pinned to ₱2,500.
- Gross above Pag-IBIG cap → Pag-IBIG pinned to ₱200.
- Gross above SSS ceiling → SSS pinned at MSC ₱35,000 × 4.5% = ₱1,575.
- Bracket boundaries: one sample each at the top edge of brackets 1–5 and one in bracket 6.
- One full end-to-end sample at ₱50,000/month with hand-verified expected net take-home.

## Rate Accuracy Disclaimer

Philippine payroll rates are updated periodically by each agency. The constants in `phTax.ts` reflect rates believed current as of 2026-04-11 and are centralized specifically so a single edit can bring them up to date. Before relying on calculator output for real decisions, cross-check the numbers against an actual payslip or the agency websites linked in the source comment.

## Out of Scope for This Spec

A future iteration may add: pay-frequency selector, 13th-month projection, salary profile persistence, integration with income transactions (auto-fill net amount on payday). None of those are in this spec.
