import { useState, useEffect, useCallback } from 'react';
import type { Goal } from '../types';
import { loadGoals, addGoal as dbAdd, updateGoal as dbUpdate, deleteGoal as dbDelete } from '../db/storage';
import { useRefreshOnRemote } from './useRefreshOnRemote';

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const g = await loadGoals();
    setGoals(g);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRefreshOnRemote(refresh);

  const addGoal = useCallback(async (data: Omit<Goal, 'id' | 'createdAt'>) => {
    const goal: Goal = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    await dbAdd(goal);
    setGoals((prev) => [...prev, goal]);
    return goal;
  }, []);

  const editGoal = useCallback(async (id: string, updates: Partial<Goal>) => {
    await dbUpdate(id, updates);
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }, []);

  const removeGoal = useCallback(async (id: string) => {
    await dbDelete(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return { goals, loading, addGoal, editGoal, removeGoal };
}
