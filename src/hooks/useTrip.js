import { useState, useCallback } from 'react';
import { generateId } from '../utils/helpers';

const INITIAL_STATE = {
  trips: [],
  activeTripId: null,
};

export function useTrip() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem('splittrip-data');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_STATE;
  });

  const persist = useCallback((newState) => {
    setState(newState);
    try {
      localStorage.setItem('splittrip-data', JSON.stringify(newState));
    } catch {}
  }, []);

  const activeTrip = state.trips.find((t) => t.id === state.activeTripId) || null;

  const createTrip = useCallback((name, baseCurrency = 'USD') => {
    const trip = {
      id: generateId(),
      name,
      baseCurrency,
      members: [],
      expenses: [],
      createdAt: new Date().toISOString(),
    };
    const newState = {
      trips: [...state.trips, trip],
      activeTripId: trip.id,
    };
    persist(newState);
    return trip;
  }, [state, persist]);

  const deleteTrip = useCallback((tripId) => {
    const newTrips = state.trips.filter((t) => t.id !== tripId);
    persist({
      trips: newTrips,
      activeTripId: state.activeTripId === tripId ? null : state.activeTripId,
    });
  }, [state, persist]);

  const setActiveTrip = useCallback((tripId) => {
    persist({ ...state, activeTripId: tripId });
  }, [state, persist]);

  const updateTrip = useCallback((tripId, updates) => {
    const newTrips = state.trips.map((t) =>
      t.id === tripId ? { ...t, ...updates } : t
    );
    persist({ ...state, trips: newTrips });
  }, [state, persist]);

  // Member operations
  const addMember = useCallback((name) => {
    if (!activeTrip) return;
    const member = { id: generateId(), name };
    const newMembers = [...activeTrip.members, member];
    updateTrip(activeTrip.id, { members: newMembers });
    return member;
  }, [activeTrip, updateTrip]);

  const removeMember = useCallback((memberId) => {
    if (!activeTrip) return;
    const hasExpenses = activeTrip.expenses.some(
      (e) => e.paidBy === memberId || e.participants.includes(memberId)
    );
    if (hasExpenses) return false;
    const newMembers = activeTrip.members.filter((m) => m.id !== memberId);
    updateTrip(activeTrip.id, { members: newMembers });
    return true;
  }, [activeTrip, updateTrip]);

  // Expense operations
  const addExpense = useCallback((expense) => {
    if (!activeTrip) return;
    const newExpense = {
      ...expense,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    const newExpenses = [...activeTrip.expenses, newExpense];
    updateTrip(activeTrip.id, { expenses: newExpenses });
    return newExpense;
  }, [activeTrip, updateTrip]);

  const removeExpense = useCallback((expenseId) => {
    if (!activeTrip) return;
    const newExpenses = activeTrip.expenses.filter((e) => e.id !== expenseId);
    updateTrip(activeTrip.id, { expenses: newExpenses });
  }, [activeTrip, updateTrip]);

  const editExpense = useCallback((expenseId, updates) => {
    if (!activeTrip) return;
    const newExpenses = activeTrip.expenses.map((e) =>
      e.id === expenseId ? { ...e, ...updates } : e
    );
    updateTrip(activeTrip.id, { expenses: newExpenses });
  }, [activeTrip, updateTrip]);

  // Export/Import
  const exportData = useCallback(() => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `splittrip-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importData = useCallback((jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.trips && Array.isArray(data.trips)) {
        persist(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [persist]);

  return {
    state,
    activeTrip,
    createTrip,
    deleteTrip,
    setActiveTrip,
    updateTrip,
    addMember,
    removeMember,
    addExpense,
    removeExpense,
    editExpense,
    exportData,
    importData,
  };
}
