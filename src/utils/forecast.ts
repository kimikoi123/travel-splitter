import type { Transaction, Installment, DebtEntry, Account, ExchangeRates } from '../types';
import { getFinanceCategoryDef } from './categories';
import { convertToBase } from './currencies';

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
  const recurring = transactions.filter(
    (t) => t.accountId === accountId && t.isRecurring
  );

  let expectedIn = 0;
  let expectedOut = 0;

  for (const t of recurring) {
    if (t.type === 'income') {
      expectedIn += t.amount;
    } else {
      expectedOut += t.amount;
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

export function getNextOccurrence(recurringDay: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), recurringDay);
  if (thisMonth >= today) return thisMonth;
  return new Date(today.getFullYear(), today.getMonth() + 1, recurringDay);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

  // 1. Recurring transactions
  for (const t of transactions) {
    if (!t.isRecurring || t.recurringDay == null) continue;
    const next = getNextOccurrence(t.recurringDay);
    if (next >= today && next <= endDate) {
      const catDef = getFinanceCategoryDef(t.category);
      events.push({
        id: `recurring-${t.id}`,
        date: next,
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
