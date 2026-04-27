import { describe, it, expect } from 'vitest';
import { rowsFromTextItems } from './pdfRowAssembly';

// Test fixture builder. Y is in PDF user space (origin bottom-left),
// so higher Y = higher on the page. Width defaults to a guess based on
// string length so the column-gap heuristic has something realistic
// to chew on.
interface FixtureItem {
  str: string;
  x: number;
  y: number;
  width?: number;
  hasEOL?: boolean;
}

function makeItems(items: FixtureItem[]) {
  return items.map((it) => ({
    str: it.str,
    transform: [1, 0, 0, 1, it.x, it.y],
    width: it.width ?? it.str.length * 5,
    hasEOL: it.hasEOL ?? false,
  }));
}

describe('rowsFromTextItems', () => {
  it('returns empty array for no items', () => {
    expect(rowsFromTextItems([])).toEqual([]);
  });

  it('groups items on the same Y into one row, X-sorted', () => {
    const items = makeItems([
      { str: 'AMOUNT', x: 400, y: 700 },
      { str: 'DATE', x: 50, y: 700 },
      { str: 'DESCRIPTION', x: 150, y: 700 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['DATE,DESCRIPTION,AMOUNT']);
  });

  it('separates rows that differ in Y by more than the tolerance', () => {
    const items = makeItems([
      { str: 'DATE', x: 50, y: 700 },
      { str: 'AMOUNT', x: 400, y: 700 },
      { str: '01/15/2026', x: 50, y: 680 },
      { str: '-250.00', x: 400, y: 680 },
    ]);
    expect(rowsFromTextItems(items)).toEqual([
      'DATE,AMOUNT',
      '01/15/2026,-250.00',
    ]);
  });

  it('treats items in the same row as one cell when X-gap is small', () => {
    // "GRAB" and "FOOD" are emitted as separate text runs but adjacent —
    // they belong to the same description cell.
    const items = makeItems([
      { str: '01/15/2026', x: 50, y: 700, width: 60 },
      { str: 'GRAB', x: 150, y: 700, width: 25 },
      { str: 'FOOD', x: 178, y: 700, width: 25 },
      { str: '-250.00', x: 400, y: 700, width: 35 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['01/15/2026,GRAB FOOD,-250.00']);
  });

  it('uses a comma when X-gap exceeds the column threshold', () => {
    const items = makeItems([
      { str: 'A', x: 50, y: 700, width: 8 },
      { str: 'B', x: 200, y: 700, width: 8 }, // big gap → new column
    ]);
    expect(rowsFromTextItems(items)).toEqual(['A,B']);
  });

  it('orders rows top-to-bottom (descending Y)', () => {
    // Items are intentionally given out of order
    const items = makeItems([
      { str: 'BOTTOM', x: 50, y: 100 },
      { str: 'TOP', x: 50, y: 700 },
      { str: 'MIDDLE', x: 50, y: 400 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['TOP', 'MIDDLE', 'BOTTOM']);
  });

  it('skips empty / whitespace-only items', () => {
    const items = makeItems([
      { str: '01/15/2026', x: 50, y: 700, width: 60 },
      { str: '  ', x: 130, y: 700, width: 5 },
      { str: 'GRAB FOOD', x: 150, y: 700, width: 60 },
      { str: '-250.00', x: 400, y: 700, width: 35 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['01/15/2026,GRAB FOOD,-250.00']);
  });

  it('quotes cells that contain commas so the downstream CSV parser does not split them', () => {
    const items = makeItems([
      { str: '01/15/2026', x: 50, y: 700, width: 60 },
      { str: 'Lazada: shoes, socks, shirt', x: 150, y: 700, width: 150 },
      { str: '-1500.00', x: 400, y: 700, width: 35 },
    ]);
    const rows = rowsFromTextItems(items);
    expect(rows[0]).toBe('01/15/2026,"Lazada: shoes, socks, shirt",-1500.00');
  });

  it('respects a custom row tolerance', () => {
    // With default tolerance (3), these would be 3 separate rows.
    // With tolerance 10, they collapse into one.
    const items = makeItems([
      { str: 'A', x: 50, y: 700 },
      { str: 'B', x: 200, y: 695 },
      { str: 'C', x: 350, y: 692 },
    ]);
    expect(rowsFromTextItems(items, 10)).toEqual(['A,B,C']);
  });
});
