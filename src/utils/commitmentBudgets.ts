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
