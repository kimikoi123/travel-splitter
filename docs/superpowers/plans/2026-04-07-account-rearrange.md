# Press-and-Hold Account Rearranging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users long-press and drag account cards to reorder them in the wallet grid, persisting the new order to IndexedDB.

**Architecture:** Wrap the existing account cards grid in `@dnd-kit` DndContext + SortableContext. A thin `SortableAccountCard` wrapper applies drag transforms. On drop, `useAccounts` recomputes `sortOrder` for all accounts and batch-writes to Dexie.

**Tech Stack:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, React 19, Dexie (IndexedDB), Tailwind CSS 4

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add @dnd-kit dependencies |
| `src/db/storage.ts` | Modify | Add `batchUpdateSortOrder` function |
| `src/hooks/useAccounts.ts` | Modify | Add `reorderAccounts` callback |
| `src/App.tsx` | Modify | Thread `onReorderAccounts` prop to WalletTab |
| `src/components/WalletTab.tsx` | Modify | Add DndContext, SortableContext, DragOverlay, SortableAccountCard, hint text |

---

### Task 1: Install @dnd-kit packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify installation**

Run:
```bash
npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: All three packages listed without errors.

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @dnd-kit packages for account reordering"
```

---

### Task 2: Add `batchUpdateSortOrder` to storage layer

**Files:**
- Modify: `src/db/storage.ts:108-123`

- [ ] **Step 1: Add `batchUpdateSortOrder` function**

Add this after the existing `deleteAccount` function (after line 123) in `src/db/storage.ts`:

```typescript
export async function batchUpdateSortOrder(updates: { id: string; sortOrder: number }[]): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    for (const { id, sortOrder } of updates) {
      await db.accounts.update(id, { sortOrder });
    }
  });
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/storage.ts
git commit -m "feat: add batchUpdateSortOrder for account reordering"
```

---

### Task 3: Add `reorderAccounts` to `useAccounts` hook

**Files:**
- Modify: `src/hooks/useAccounts.ts`

- [ ] **Step 1: Add import for `batchUpdateSortOrder`**

In `src/hooks/useAccounts.ts`, update the import from `../db/storage` (line 3-7) to include the new function:

```typescript
import {
  loadAccounts,
  addAccount as dbAddAccount,
  updateAccount as dbUpdateAccount,
  deleteAccount as dbDeleteAccount,
  batchUpdateSortOrder,
} from '../db/storage';
```

- [ ] **Step 2: Add `reorderAccounts` callback**

Add this after the `removeAccount` callback (after line 46) and before `netWorth`:

```typescript
const reorderAccounts = useCallback(async (activeId: string, overId: string) => {
  const oldIndex = accounts.findIndex((a) => a.id === activeId);
  const newIndex = accounts.findIndex((a) => a.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

  const reordered = [...accounts];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);

  const updated = reordered.map((a, i) => ({ ...a, sortOrder: i }));
  setAccounts(updated);

  await batchUpdateSortOrder(updated.map((a) => ({ id: a.id, sortOrder: a.sortOrder })));
}, [accounts]);
```

- [ ] **Step 3: Expose `reorderAccounts` in the return value**

Update the return statement (line 60) to:

```typescript
return { accounts, loading, addAccount, editAccount, removeAccount, reorderAccounts, netWorth };
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAccounts.ts
git commit -m "feat: add reorderAccounts callback to useAccounts hook"
```

---

### Task 4: Thread `onReorderAccounts` through App.tsx

**Files:**
- Modify: `src/App.tsx:407-413`

- [ ] **Step 1: Find the `reorderAccounts` destructure**

In `src/App.tsx`, find where `useAccounts()` is destructured. It will look like:

```typescript
const { accounts, loading, addAccount, editAccount, removeAccount, netWorth } = useAccounts();
```

Add `reorderAccounts` to the destructure:

```typescript
const { accounts, loading, addAccount, editAccount, removeAccount, reorderAccounts, netWorth } = useAccounts();
```

- [ ] **Step 2: Pass the prop to WalletTab**

Update the `<WalletTab>` JSX (around line 407-413) to include the new prop:

```tsx
<WalletTab
  accounts={accounts}
  netWorth={netWorth}
  defaultCurrency={preferences.defaultCurrency}
  onAddAccount={handleAddAccount}
  onSelectAccount={setSelectedAccountId}
  onReorderAccounts={reorderAccounts}
/>
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: Will fail because WalletTab doesn't accept `onReorderAccounts` yet. This is expected — Task 5 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: thread reorderAccounts prop to WalletTab"
```

---

### Task 5: Add drag-and-drop to WalletTab

**Files:**
- Modify: `src/components/WalletTab.tsx`

This is the main UI task. We modify `WalletTab.tsx` to add the DndContext, SortableContext, SortableAccountCard wrapper, DragOverlay, and hint text.

- [ ] **Step 1: Add imports**

Replace the existing import line at the top of `src/components/WalletTab.tsx`:

```typescript
import { useState } from 'react';
```

with:

```typescript
import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

- [ ] **Step 2: Add `onReorderAccounts` to props interface**

Update the `WalletTabProps` interface (line 8-14) to:

```typescript
interface WalletTabProps {
  accounts: Account[];
  netWorth: number;
  defaultCurrency: string;
  onAddAccount: () => void;
  onSelectAccount: (id: string) => void;
  onReorderAccounts: (activeId: string, overId: string) => void;
}
```

- [ ] **Step 3: Add `SortableAccountCard` component**

Add this component right after the existing `AccountCard` component (after line 168, before the `WalletTab` default export):

```typescript
function SortableAccountCard({
  account,
  onSelect,
}: {
  account: Account;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AccountCard account={account} onSelect={onSelect} />
    </div>
  );
}
```

- [ ] **Step 4: Update the `WalletTab` component**

Update the `WalletTab` function signature to destructure the new prop:

```typescript
export default function WalletTab({
  accounts,
  netWorth,
  defaultCurrency,
  onAddAccount,
  onSelectAccount,
  onReorderAccounts,
}: WalletTabProps) {
```

Add state and sensors right after the existing `filter` state (after line 178):

```typescript
const [activeId, setActiveId] = useState<string | null>(null);

const sensors = useSensors(
  useSensor(TouchSensor, {
    activationConstraint: { delay: 500, tolerance: 5 },
  }),
  useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  }),
);

const activeAccount = useMemo(
  () => (activeId ? filtered.find((a) => a.id === activeId) ?? null : null),
  [activeId, filtered],
);

function handleDragStart(event: DragStartEvent) {
  setActiveId(String(event.active.id));
}

function handleDragEnd(event: DragEndEvent) {
  setActiveId(null);
  const { active, over } = event;
  if (over && active.id !== over.id) {
    onReorderAccounts(String(active.id), String(over.id));
  }
}
```

- [ ] **Step 5: Replace the account cards grid JSX**

Replace the existing grid block (lines 251-256):

```tsx
{/* Account Cards Grid */}
<div className="grid grid-cols-2 gap-3">
  {filtered.map((account) => (
    <AccountCard key={account.id} account={account} onSelect={onSelectAccount} />
  ))}
</div>
```

with:

```tsx
{/* Hint text */}
<p className="text-xs text-text-secondary mb-3">
  Press and hold an account card to rearrange it.
</p>

{/* Account Cards Grid */}
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <SortableContext
    items={filtered.map((a) => a.id)}
    strategy={rectSortingStrategy}
  >
    <div className="grid grid-cols-2 gap-3">
      {filtered.map((account) => (
        <SortableAccountCard
          key={account.id}
          account={account}
          onSelect={onSelectAccount}
        />
      ))}
    </div>
  </SortableContext>

  <DragOverlay>
    {activeAccount ? (
      <div className="scale-105 shadow-xl rounded-2xl">
        <AccountCard account={activeAccount} onSelect={() => {}} />
      </div>
    ) : null}
  </DragOverlay>
</DndContext>
```

- [ ] **Step 6: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: PASS, no errors (this resolves the type error from Task 4).

- [ ] **Step 7: Commit**

```bash
git add src/components/WalletTab.tsx
git commit -m "feat: add press-and-hold drag-to-reorder for account cards"
```

---

### Task 6: Manual testing and final verification

- [ ] **Step 1: Build check**

Run:
```bash
npm run build
```

Expected: PASS, no errors.

- [ ] **Step 2: Run existing tests**

Run:
```bash
npm run test
```

Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Manual test on dev server**

Run:
```bash
npm run dev
```

Test the following:

1. **Hint text visible** — "Press and hold an account card to rearrange it." appears below filter pills
2. **Short tap** — Tapping a card still navigates to account detail (no interference)
3. **Long-press drag (mobile/touch simulation)** — Hold a card for 500ms, it lifts with overlay, drag to new position, other cards shift, drop persists
4. **Mouse drag (desktop)** — Click and drag 8px+ to start, same behavior
5. **Persistence** — Refresh page, order is preserved
6. **Filter tabs** — Reordering works when a filter (Debit/Credit/Investments) is active

- [ ] **Step 4: Final commit if any fixes needed**

If any adjustments were needed during testing, commit them:
```bash
git add -A
git commit -m "fix: address issues found during manual testing of account reorder"
```
