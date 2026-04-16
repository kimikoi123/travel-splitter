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
