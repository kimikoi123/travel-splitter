import { useState } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, CheckCircle, Undo2 } from 'lucide-react';
import { calculateBalances, calculateDirectDebts, calculateSimplifiedDebts } from '../utils/settlement';
import { formatCurrency, convertToBase } from '../utils/currencies';
import { getInitials, getAvatarColor } from '../utils/helpers';
import type { Expense, Member, ExchangeRates } from '../types';

interface SettlementProps {
  expenses: Expense[];
  members: Member[];
  baseCurrency: string;
  rates: ExchangeRates;
  onMarkPaid?: (from: string, to: string, amount: number) => void;
  onUnmarkPaid?: (expenseId: string) => void;
}

type DebtMode = 'direct' | 'simplified';

export default function Settlement({ expenses, members, baseCurrency, rates, onMarkPaid, onUnmarkPaid }: SettlementProps) {
  const [debtMode, setDebtMode] = useState<DebtMode>('direct');

  if (members.length === 0 || expenses.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4 text-center py-8">
        <p className="text-text-secondary text-sm">Add members and expenses to see settlements</p>
      </div>
    );
  }

  const balances = calculateBalances(expenses, members, baseCurrency, rates);
  const debts = debtMode === 'simplified'
    ? calculateSimplifiedDebts(expenses, members, baseCurrency, rates)
    : calculateDirectDebts(expenses, members, baseCurrency, rates);

  const settlementExpenses = expenses.filter(e => e.isSettlement);
  const settledDebts = settlementExpenses.map(e => ({
    from: e.paidBy,
    to: e.participants[0],
    amount: e.amount,
    expenseId: e.id,
  }));

  const getMember = (id: string) => members.find((m) => m.id === id);
  const getMemberIndex = (id: string) => members.findIndex((m) => m.id === id);

  const totalSpent = expenses
    .filter(e => !e.isSettlement)
    .reduce((sum, e) => {
      return sum + convertToBase(e.amount, e.currency, baseCurrency, rates);
    }, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Balances
          </h3>
          <span className="text-xs text-text-secondary">
            Total: {formatCurrency(totalSpent, baseCurrency)}
          </span>
        </div>
        <div className="space-y-2">
          {members.map((m, i) => {
            const balance = balances[m.id] ?? 0;
            const isPositive = balance > 0.01;
            const isNegative = balance < -0.01;

            return (
              <div key={m.id} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: getAvatarColor(i) }}
                >
                  {getInitials(m.name)}
                </div>
                <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
                <div className="flex items-center gap-1">
                  {isPositive && <TrendingUp size={14} className="text-success" />}
                  {isNegative && <TrendingDown size={14} className="text-danger" />}
                  <span
                    className={`text-sm font-medium ${
                      isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-text-secondary'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {formatCurrency(balance, baseCurrency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Settlement */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide" data-heading>
            Who Pays Who
          </h3>
          <div className="flex gap-1 bg-surface-light rounded-lg p-0.5">
            {(['direct', 'simplified'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDebtMode(mode)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                  debtMode === mode
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {debts.length === 0 && settledDebts.length === 0 ? (
          <p className="text-sm text-success text-center py-4">All settled up!</p>
        ) : (
          <div className="space-y-3">
            {/* Active debts grouped by creditor */}
            {(() => {
              const debtsByCreditor = new Map<string, typeof debts>();
              debts.forEach((debt) => {
                const list = debtsByCreditor.get(debt.to) || [];
                list.push(debt);
                debtsByCreditor.set(debt.to, list);
              });

              return Array.from(debtsByCreditor.entries()).map(([creditorId, creditorDebts]) => {
                const creditor = getMember(creditorId);
                if (!creditor) return null;

                return (
                  <div key={creditorId} className="bg-surface-light rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-text-secondary">Pay</span>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: getAvatarColor(getMemberIndex(creditorId)) }}
                      >
                        {getInitials(creditor.name)}
                      </div>
                      <span className="text-sm font-semibold text-text-primary">{creditor.name}</span>
                    </div>
                    <div className="space-y-1.5 ml-2">
                      {creditorDebts.map((debt, i) => {
                        const from = getMember(debt.from);
                        if (!from) return null;

                        return (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <ArrowRight size={12} className="text-text-secondary shrink-0" />
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                style={{ backgroundColor: getAvatarColor(getMemberIndex(debt.from)) }}
                              >
                                {getInitials(from.name)}
                              </div>
                              <span className="text-sm text-text-primary truncate">{from.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-sm font-semibold text-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(debt.amount, baseCurrency)}
                              </span>
                              {onMarkPaid && (
                                <button
                                  onClick={() => onMarkPaid(debt.from, debt.to, debt.amount)}
                                  className="p-1 rounded-md text-text-secondary hover:text-success hover:bg-success/10 transition-colors"
                                  title="Mark as paid"
                                >
                                  <CheckCircle size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}

            {/* Settled debts */}
            {settledDebts.map((debt) => {
              const from = getMember(debt.from);
              const to = debt.to ? getMember(debt.to) : undefined;
              if (!from || !to) return null;

              return (
                <div
                  key={debt.expenseId}
                  className="bg-surface-light rounded-lg p-3 opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: getAvatarColor(getMemberIndex(debt.from)) }}
                      >
                        {getInitials(from.name)}
                      </div>
                      <span className="text-sm font-medium text-text-primary truncate line-through">{from.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <CheckCircle size={14} className="text-success" />
                      <span className="text-sm font-semibold text-success line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(debt.amount, baseCurrency)}
                      </span>
                      {onUnmarkPaid && (
                        <button
                          onClick={() => onUnmarkPaid(debt.expenseId)}
                          className="p-1 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Undo settlement"
                        >
                          <Undo2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 ml-4">
                    <ArrowRight size={12} className="text-text-secondary shrink-0" />
                    <span className="text-xs text-text-secondary">paid</span>
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ backgroundColor: getAvatarColor(getMemberIndex(debt.to!)) }}
                    >
                      {getInitials(to.name)}
                    </div>
                    <span className="text-xs text-text-primary truncate">{to.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {debts.length === 0 && settledDebts.length > 0 && (
          <p className="text-sm text-success text-center py-2">All settled up!</p>
        )}
      </div>
    </div>
  );
}
