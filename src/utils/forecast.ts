import type { Transaction, Installment, DebtEntry, Account, ExchangeRates, RecurringFrequency } from '../types';
import { getFinanceCategoryDef } from './categories';
import { convertToBase } from './currencies';

// --- Recurring occurrence helpers ---

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function resolveFrequency(txn: Transaction): RecurringFrequency {
  return txn.recurringFrequency ?? 'monthly';
}

export function getRecurringOccurrences(
  txn: Transaction,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  if (!txn.isRecurring) return [];
  const freq = resolveFrequency(txn);
  const endLimit = txn.recurringEndDate ? new Date(txn.recurringEndDate + 'T23:59:59') : null;
  const results: Date[] = [];

  const effectiveEnd = endLimit && endLimit < windowEnd ? endLimit : windowEnd;

  switch (freq) {
    case 'daily': {
      const cursor = new Date(Math.max(windowStart.getTime(), startOfToday().getTime()));
      cursor.setHours(0, 0, 0, 0);
      const maxIter = Math.ceil((effectiveEnd.getTime() - cursor.getTime()) / 86400000) + 1;
      for (let i = 0; i < maxIter && i < 366; i++) {
        const d = new Date(cursor);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        if (d > effectiveEnd) break;
        if (d >= windowStart) results.push(d);
      }
      break;
    }
    case 'weekly':
    case 'biweekly': {
      const step = freq === 'biweekly' ? 14 : 7;
      const targetDay = txn.recurringDayOfWeek ?? new Date(txn.date).getDay();
      // Anchor from the transaction date to maintain cadence
      const anchor = new Date(txn.date);
      anchor.setHours(0, 0, 0, 0);
      // Find first occurrence of targetDay on or after anchor
      const anchorDow = anchor.getDay();
      const diff = (targetDay - anchorDow + 7) % 7;
      anchor.setDate(anchor.getDate() + diff);
      // Step forward to reach the window
      if (anchor < windowStart) {
        const gap = Math.floor((windowStart.getTime() - anchor.getTime()) / (step * 86400000));
        anchor.setDate(anchor.getDate() + gap * step);
      }
      for (let i = 0; i < 53; i++) {
        const d = new Date(anchor);
        d.setDate(d.getDate() + i * step);
        d.setHours(0, 0, 0, 0);
        if (d > effectiveEnd) break;
        if (d >= windowStart) results.push(d);
      }
      break;
    }
    case 'monthly': {
      const day = txn.recurringDay ?? new Date(txn.date).getDate();
      const start = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
      for (let i = 0; i < 13; i++) {
        const y = start.getFullYear();
        const m = start.getMonth() + i;
        const clamped = clampDay(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(), day);
        const d = new Date(y, m, clamped);
        d.setHours(0, 0, 0, 0);
        if (d > effectiveEnd) break;
        if (d >= windowStart) results.push(d);
      }
      break;
    }
    case 'quarterly': {
      const day = txn.recurringDay ?? new Date(txn.date).getDate();
      // Anchor quarter from the transaction date
      const txnDate = new Date(txn.date);
      const anchorMonth = txnDate.getMonth();
      const start = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
      // Go back far enough to find the right quarter phase
      for (let m = anchorMonth - 12; m < anchorMonth + 48; m += 3) {
        const y = txnDate.getFullYear();
        const d = new Date(y, m, clampDay(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(), day));
        d.setHours(0, 0, 0, 0);
        if (d > effectiveEnd) break;
        if (d >= windowStart) results.push(d);
      }
      break;
    }
    case 'yearly': {
      const month = (txn.recurringMonth ?? (new Date(txn.date).getMonth() + 1)) - 1; // 0-indexed
      const day = txn.recurringDay ?? new Date(txn.date).getDate();
      for (let y = windowStart.getFullYear(); y <= windowEnd.getFullYear() + 1; y++) {
        const clamped = clampDay(y, month, day);
        const d = new Date(y, month, clamped);
        d.setHours(0, 0, 0, 0);
        if (d > effectiveEnd) break;
        if (d >= windowStart) results.push(d);
      }
      break;
    }
    case 'custom': {
      const dates = txn.recurringCustomDates ?? [];
      for (const iso of dates) {
        const d = new Date(iso);
        d.setHours(0, 0, 0, 0);
        if (d >= windowStart && d <= effectiveEnd) results.push(d);
      }
      results.sort((a, b) => a.getTime() - b.getTime());
      break;
    }
  }

  return results;
}

export function getNextRecurringDate(txn: Transaction): Date | null {
  if (!txn.isRecurring) return null;
  const today = startOfToday();
  const farFuture = new Date(today);
  farFuture.setFullYear(farFuture.getFullYear() + 1);
  const occ = getRecurringOccurrences(txn, today, farFuture);
  return occ.length > 0 ? occ[0] : null;
}

export function formatRecurringLabel(txn: Transaction): string {
  const freq = resolveFrequency(txn);
  switch (freq) {
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const dow = txn.recurringDayOfWeek ?? new Date(txn.date).getDay();
      return `Every ${DAY_NAMES[dow]}`;
    }
    case 'biweekly': {
      const dow = txn.recurringDayOfWeek ?? new Date(txn.date).getDay();
      return `Every 2 weeks on ${DAY_NAMES[dow]}`;
    }
    case 'monthly':
      return `Every month on day ${txn.recurringDay ?? new Date(txn.date).getDate()}`;
    case 'quarterly':
      return `Every 3 months on day ${txn.recurringDay ?? new Date(txn.date).getDate()}`;
    case 'yearly': {
      const m = (txn.recurringMonth ?? (new Date(txn.date).getMonth() + 1)) - 1;
      const d = txn.recurringDay ?? new Date(txn.date).getDate();
      return `Every year on ${MONTH_NAMES[m]} ${d}`;
    }
    case 'custom': {
      const count = txn.recurringCustomDates?.length ?? 0;
      return count === 0 ? 'Custom dates' : `On ${count} specific date${count !== 1 ? 's' : ''}`;
    }
    default:
      return 'Recurring';
  }
}

// --- Account-level forecast ---

export interface ForecastResult {
  expectedIn: number;
  expectedOut: number;
  spendable: number;
}

export function computeForecast(
  transactions: Transaction[],
  accountId: string,
  currentBalance: number
): ForecastResult {
  const today = startOfToday();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 30);

  const recurring = transactions.filter(
    (t) => t.accountId === accountId && t.isRecurring
  );

  let expectedIn = 0;
  let expectedOut = 0;

  for (const t of recurring) {
    const count = getRecurringOccurrences(t, today, endDate).length;
    if (t.type === 'income') {
      expectedIn += t.amount * count;
    } else {
      expectedOut += t.amount * count;
    }
  }

  const spendable = Math.max(0, currentBalance + expectedIn - expectedOut);

  return { expectedIn, expectedOut, spendable };
}

// --- Cashflow timeline ---

export type ForecastEventSource = 'recurring' | 'payday' | 'installment' | 'debt' | 'credit-card';

export interface ForecastEvent {
  id: string;
  date: Date;
  description: string;
  amount: number;        // positive = inflow, negative = outflow
  currency: string;
  source: ForecastEventSource;
  emoji: string;
  isReminder?: boolean;
}

export interface ForecastTimeline {
  events: ForecastEvent[];
  totalIn: number;
  totalOut: number;
  net: number;
}

/** Monthly-only next occurrence (used for payday, installments, credit cards) */
export function getNextOccurrence(recurringDay: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), recurringDay);
  if (thisMonth >= today) return thisMonth;
  return new Date(today.getFullYear(), today.getMonth() + 1, recurringDay);
}

export function computeTimeline(params: {
  transactions: Transaction[];
  paydayDay?: number;
  paydayAmount?: number;
  paydayCurrency?: string;
  installments: Installment[];
  debts: DebtEntry[];
  accounts: Account[];
  defaultCurrency: string;
  exchangeRates: ExchangeRates | null;
  windowDays?: number;
}): ForecastTimeline {
  const {
    transactions,
    paydayDay,
    paydayAmount,
    paydayCurrency,
    installments,
    debts,
    accounts,
    defaultCurrency,
    exchangeRates,
    windowDays = 30,
  } = params;

  const today = startOfToday();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + windowDays);

  const events: ForecastEvent[] = [];

  // 1. Recurring transactions (all frequencies)
  for (const t of transactions) {
    if (!t.isRecurring) continue;
    const occurrences = getRecurringOccurrences(t, today, endDate);
    const catDef = getFinanceCategoryDef(t.category);
    for (const occ of occurrences) {
      events.push({
        id: `recurring-${t.id}-${dateKey(occ)}`,
        date: occ,
        description: t.description || catDef.label,
        amount: t.type === 'income' ? t.amount : -t.amount,
        currency: t.currency,
        source: 'recurring',
        emoji: catDef.emoji,
      });
    }
  }

  // 2. Payday
  if (paydayDay != null && paydayAmount != null && paydayAmount > 0) {
    const next = getNextOccurrence(paydayDay);
    if (next >= today && next <= endDate) {
      events.push({
        id: 'payday',
        date: next,
        description: 'Payday',
        amount: paydayAmount,
        currency: paydayCurrency ?? defaultCurrency,
        source: 'payday',
        emoji: '💰',
      });
    }
  }

  // 3. Installments (active ones with remaining months)
  for (const inst of installments) {
    if (inst.paidMonths >= inst.totalMonths) continue;
    const dayOfMonth = new Date(inst.startDate).getDate();
    const next = getNextOccurrence(dayOfMonth);
    if (next >= today && next <= endDate) {
      events.push({
        id: `installment-${inst.id}`,
        date: next,
        description: inst.itemName,
        amount: -inst.monthlyPayment,
        currency: inst.currency,
        source: 'installment',
        emoji: '📦',
      });
    }
  }

  // 4. Debts with due dates
  for (const debt of debts) {
    if (!debt.dueDate || debt.paidAmount >= debt.amount) continue;
    const due = new Date(debt.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due >= today && due <= endDate) {
      const remaining = debt.amount - debt.paidAmount;
      events.push({
        id: `debt-${debt.id}`,
        date: due,
        description: debt.personName,
        amount: debt.direction === 'i_owe' ? -remaining : remaining,
        currency: debt.currency,
        source: 'debt',
        emoji: '🤝',
      });
    }
  }

  // 5. Credit card due dates (reminders only)
  for (const acc of accounts) {
    if (acc.type !== 'credit' || acc.dueDay == null || acc.balance <= 0) continue;
    const next = getNextOccurrence(acc.dueDay);
    if (next >= today && next <= endDate) {
      events.push({
        id: `credit-${acc.id}`,
        date: next,
        description: `${acc.name} payment`,
        amount: -acc.balance,
        currency: acc.currency,
        source: 'credit-card',
        emoji: '💳',
        isReminder: true,
      });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute summary totals in default currency
  let totalIn = 0;
  let totalOut = 0;
  for (const e of events) {
    if (e.isReminder) continue;
    const converted = e.currency === defaultCurrency
      ? Math.abs(e.amount)
      : convertToBase(Math.abs(e.amount), e.currency, defaultCurrency, exchangeRates);
    if (e.amount > 0) {
      totalIn += converted;
    } else {
      totalOut += converted;
    }
  }

  return { events, totalIn, totalOut, net: totalIn - totalOut };
}
