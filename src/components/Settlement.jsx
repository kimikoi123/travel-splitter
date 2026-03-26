import { useState } from 'react';
import { ArrowRight, Zap, List, TrendingUp, TrendingDown } from 'lucide-react';
import { calculateBalances, calculateSimplifiedDebts, calculateFullDebts } from '../utils/settlement';
import { formatCurrency, convertToBase } from '../utils/currencies';
import { getInitials, getAvatarColor } from '../utils/helpers';

export default function Settlement({ expenses, members, baseCurrency }) {
  const [view, setView] = useState('simplified');

  if (members.length === 0 || expenses.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4 text-center py-8">
        <p className="text-text-secondary text-sm">Add members and expenses to see settlements</p>
      </div>
    );
  }

  const balances = calculateBalances(expenses, members, baseCurrency);
  const simplifiedDebts = calculateSimplifiedDebts(balances);
  const fullDebts = calculateFullDebts(balances);
  const debts = view === 'simplified' ? simplifiedDebts : fullDebts;

  const getMember = (id) => members.find((m) => m.id === id);
  const getMemberIndex = (id) => members.findIndex((m) => m.id === id);

  const totalSpent = expenses.reduce((sum, e) => {
    return sum + convertToBase(e.amount, e.currency, baseCurrency);
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
            const balance = balances[m.id] || 0;
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
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Who Pays Who
          </h3>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setView('simplified')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'simplified'
                  ? 'bg-primary text-white'
                  : 'bg-surface-light text-text-secondary hover:text-text-primary'
              }`}
            >
              <Zap size={12} />
              Simplified
            </button>
            <button
              onClick={() => setView('full')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'full'
                  ? 'bg-primary text-white'
                  : 'bg-surface-light text-text-secondary hover:text-text-primary'
              }`}
            >
              <List size={12} />
              Detailed
            </button>
          </div>
        </div>

        {debts.length === 0 ? (
          <p className="text-sm text-success text-center py-4">All settled up!</p>
        ) : (
          <div className="space-y-2">
            {debts.map((debt, i) => {
              const from = getMember(debt.from);
              const to = getMember(debt.to);
              if (!from || !to) return null;

              return (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-surface-light rounded-lg p-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: getAvatarColor(getMemberIndex(debt.from)) }}
                  >
                    {getInitials(from.name)}
                  </div>
                  <span className="text-sm text-text-primary truncate">{from.name}</span>
                  <ArrowRight size={16} className="text-text-secondary shrink-0" />
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: getAvatarColor(getMemberIndex(debt.to)) }}
                  >
                    {getInitials(to.name)}
                  </div>
                  <span className="text-sm text-text-primary truncate">{to.name}</span>
                  <span className="text-sm font-semibold text-accent ml-auto shrink-0">
                    {formatCurrency(debt.amount, baseCurrency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {view === 'simplified' && debts.length > 0 && (
          <p className="text-xs text-text-secondary mt-3 text-center">
            Only {debts.length} transaction{debts.length > 1 ? 's' : ''} needed to settle up
          </p>
        )}
      </div>
    </div>
  );
}
