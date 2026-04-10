import { useEffect } from 'react';

// Data hooks subscribe via `useRefreshOnRemote(load)` so that whenever the
// sync engine finishes applying a pull, each hook re-reads from Dexie and
// surfaces the new rows in its component state. This replaces the blunt
// `window.location.reload()` that Phase 4's PairEntryScreen used to call
// after a successful pair.
//
// The engine dispatches a DOM `CustomEvent` on `window` rather than going
// through the sync-state store so hooks can opt in independently of
// whether they care about the status chip.
export const REMOTE_APPLIED_EVENT = 'finverse:remote-applied';

export function useRefreshOnRemote(refresh: () => void | Promise<void>): void {
  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener(REMOTE_APPLIED_EVENT, handler);
    return () => window.removeEventListener(REMOTE_APPLIED_EVENT, handler);
  }, [refresh]);
}
