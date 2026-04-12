import { useState, useEffect, useCallback } from 'react';
import type { UserPreferences, PaydayConfigMonthly } from '../types';
import { loadUserPreferences, saveUserPreferences } from '../db/storage';
import { useRefreshOnRemote } from './useRefreshOnRemote';

const DEFAULT_PREFERENCES: UserPreferences = {
  id: 'default',
  displayName: '',
  defaultCurrency: 'PHP',
  theme: 'system',
  onboardingComplete: false,
};

function migratePayday(prefs: Record<string, unknown>): boolean {
  if (prefs.paydayDay != null && prefs.paydayConfig == null) {
    const config: PaydayConfigMonthly = {
      frequency: 'monthly',
      day: prefs.paydayDay as number,
      amount: (prefs.paydayAmount as number) ?? 0,
      currency: (prefs.paydayCurrency as string) ?? 'PHP',
    };
    (prefs as Record<string, unknown>).paydayConfig = config;
    delete prefs.paydayDay;
    delete prefs.paydayAmount;
    delete prefs.paydayCurrency;
    return true;
  }
  return false;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const prefs = await loadUserPreferences();
    if (prefs) {
      const raw = prefs as unknown as Record<string, unknown>;
      if (migratePayday(raw)) {
        const migrated = raw as unknown as UserPreferences;
        await saveUserPreferences(migrated);
        setPreferences(migrated);
      } else {
        setPreferences(prefs);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRefreshOnRemote(refresh);

  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...updates, id: 'default' } as UserPreferences;
    setPreferences(updated);
    await saveUserPreferences(updated);
    return updated;
  }, [preferences]);

  return { preferences, loading, updatePreferences };
}
