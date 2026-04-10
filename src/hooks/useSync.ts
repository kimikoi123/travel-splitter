import { useSyncExternalStore } from 'react';
import { getIdentity, hasIdentity as _hasIdentity } from '../sync/deviceIdentity';
import {
  bootstrapNewVault,
  joinVaultWithToken,
  signOutLocal,
  syncNow,
} from '../sync/syncEngine';
import { getSnapshot, subscribe, type SyncSnapshot } from '../sync/syncState';

export interface UseSyncResult extends SyncSnapshot {
  hasIdentity: boolean;
  vaultIdShort: string | null;
  syncNow: () => Promise<void>;
  bootstrapNewVault: (label?: string) => Promise<void>;
  joinVaultWithToken: (token: string, label?: string) => Promise<void>;
  signOutLocal: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const identity = getIdentity();
  return {
    ...snapshot,
    hasIdentity: _hasIdentity(),
    vaultIdShort: identity ? identity.vaultId.slice(0, 8) : null,
    syncNow,
    bootstrapNewVault,
    joinVaultWithToken,
    signOutLocal,
  };
}
