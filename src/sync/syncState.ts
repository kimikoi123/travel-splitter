// Minimal external store for the sync engine's state. Components subscribe
// via `useSync()` (built on `useSyncExternalStore`) and re-render whenever
// status, lastSyncedAt, or error change.

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'no-identity';

export interface SyncSnapshot {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  pendingCount: number;
  // Number of receipts still being uploaded to Vercel Blob. Non-zero
  // only while the receipt uploader is actively draining the queue;
  // resets to 0 when drainReceiptUploads finishes (whether or not all
  // uploads succeeded — failed ones retry on the next cycle).
  uploadingReceipts: number;
}

const INITIAL: SyncSnapshot = {
  status: 'no-identity',
  lastSyncedAt: null,
  error: null,
  pendingCount: 0,
  uploadingReceipts: 0,
};

let current: SyncSnapshot = INITIAL;
const listeners = new Set<() => void>();

export function getSnapshot(): SyncSnapshot {
  return current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(patch: Partial<SyncSnapshot>): void {
  const next = { ...current, ...patch };
  if (shallowEqual(current, next)) return;
  current = next;
  for (const listener of listeners) listener();
}

export function reset(): void {
  update(INITIAL);
}

function shallowEqual(a: SyncSnapshot, b: SyncSnapshot): boolean {
  return (
    a.status === b.status &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.error === b.error &&
    a.pendingCount === b.pendingCount &&
    a.uploadingReceipts === b.uploadingReceipts
  );
}
