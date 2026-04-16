import { describe, it, expect } from 'vitest';
import { clampDueDay, resolveDueDate, monthKey, deriveCommitmentState } from './commitmentBudgets';
import type { Budget } from '../types';

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
