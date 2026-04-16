// Pure helpers for commitment budgets. No DB, no React, no side effects.

import type { Budget } from '../types';

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
