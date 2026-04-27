// Pure helpers for grouping PDF text items into CSV-shaped rows. Lives
// outside pdfStatementExtractor.ts so tests can exercise the row logic
// without booting pdfjs (which needs a browser-like global environment).

export interface MinimalTextItem {
  str: string;
  // PDF transform matrix [a, b, c, d, e, f] — e is X, f is Y in PDF user space.
  transform: number[];
  width: number;
  hasEOL?: boolean;
}

export const PDF_DEFAULTS = { rowTolerance: 3, columnGap: 8 };

export function rowsFromTextItems(
  items: MinimalTextItem[],
  rowTolerance = PDF_DEFAULTS.rowTolerance,
  columnGap = PDF_DEFAULTS.columnGap,
): string[] {
  if (items.length === 0) return [];

  const cleaned = items.filter((it) => it.str.trim().length > 0);
  if (cleaned.length === 0) return [];

  // PDF Y origin is bottom-left → larger Y means higher on the page;
  // we want descending Y for natural reading order.
  const sorted = [...cleaned].sort((a, b) => {
    const dy = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
    if (Math.abs(dy) > rowTolerance) return dy;
    return (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
  });

  const rows: MinimalTextItem[][] = [];
  let currentRow: MinimalTextItem[] = [];
  let currentY: number | null = null;

  for (const item of sorted) {
    const y = item.transform[5] ?? 0;
    if (currentY === null || Math.abs(y - currentY) <= rowTolerance) {
      currentRow.push(item);
      if (currentY === null) currentY = y;
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentY = y;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows.map((row) => assembleRow(row, columnGap));
}

function assembleRow(items: MinimalTextItem[], columnGap: number): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));

  // First pass: group adjacent items into cells based on their X-gap.
  // A small gap means same cell (e.g. "GRAB" + "FOOD" emitted as separate
  // text runs), a large gap means new column. Doing this in two passes
  // matters because a cell may contain a comma (e.g. "Mar 16, 2026") —
  // we can't decide whether to CSV-quote until we know the full cell text.
  const cells: string[] = [];
  let currentCell = sorted[0]!.str;
  let prevEnd = (sorted[0]!.transform[4] ?? 0) + (sorted[0]!.width || 0);

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const x = item.transform[4] ?? 0;
    const gap = x - prevEnd;
    if (gap > columnGap) {
      cells.push(currentCell);
      currentCell = item.str;
    } else {
      const needsSpace = !currentCell.endsWith(' ') && !item.str.startsWith(' ');
      currentCell += (needsSpace ? ' ' : '') + item.str;
    }
    prevEnd = x + (item.width || 0);
  }
  cells.push(currentCell);

  // Second pass: CSV-encode each fully-assembled cell. Cells containing
  // commas, double-quotes, or newlines must be quoted per RFC 4180 so the
  // downstream parseCSVLine doesn't split them into bogus columns.
  return cells
    .map((c) => {
      const cleaned = c.replace(/\s+/g, ' ').trim();
      if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n')) {
        return `"${cleaned.replace(/"/g, '""')}"`;
      }
      return cleaned;
    })
    .join(',');
}
