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

  let result = sorted[0]!.str;
  let prevEnd = (sorted[0]!.transform[4] ?? 0) + (sorted[0]!.width || 0);

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const x = item.transform[4] ?? 0;
    const gap = x - prevEnd;
    // Quote any cell with a comma so the downstream CSV parser doesn't
    // split it into bogus columns.
    const cell = item.str.includes(',') ? `"${item.str.replace(/"/g, '""')}"` : item.str;
    if (gap > columnGap) {
      result += ',' + cell;
    } else {
      const needsSpace = !result.endsWith(' ') && !item.str.startsWith(' ');
      result += (needsSpace ? ' ' : '') + cell;
    }
    prevEnd = x + (item.width || 0);
  }
  return result.replace(/\s+/g, ' ').trim();
}
