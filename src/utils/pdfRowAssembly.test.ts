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

  it('quotes the FIRST cell when it contains a comma (regression: dates like "Mar 16, 2026")', () => {
    // Banks render long-form dates as a single PDF text item. When that
    // item lands in column 1, an earlier version emitted it unquoted,
    // which made the downstream CSV parser split the date in two.
    const items = makeItems([
      { str: 'Mar 16, 2026', x: 50, y: 700, width: 60 },
      { str: '7-ELEVEN', x: 150, y: 700, width: 60 },
      { str: 'PHP 75.00', x: 400, y: 700, width: 50 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['"Mar 16, 2026",7-ELEVEN,PHP 75.00']);
  });

  it('joins multi-run dates into one quoted cell', () => {
    // PDFs sometimes split "Mar 16, 2026" into multiple text runs at
    // glyph boundaries. The cell-grouping pass should re-assemble them
    // before deciding whether to quote.
    const items = makeItems([
      { str: 'Mar', x: 50, y: 700, width: 18 },
      { str: '16,', x: 70, y: 700, width: 12 },
      { str: '2026', x: 84, y: 700, width: 25 },
      { str: '7-ELEVEN', x: 200, y: 700, width: 60 },
      { str: 'PHP 75.00', x: 400, y: 700, width: 50 },
    ]);
    expect(rowsFromTextItems(items)).toEqual(['"Mar 16, 2026",7-ELEVEN,PHP 75.00']);
  });

  it('groups a multi-comma merchant description into a single quoted cell (UnionBank shape)', () => {
    // pdfjs frequently splits descriptions like "SHOPEE PH, MANDALUYONG, PH"
    // at glyph boundaries — each comma-terminated chunk lands as its own
    // text run at adjacent X positions. The cell builder must merge them
    // before CSV-encoding so the downstream parser sees one description.
    const items = makeItems([
      { str: 'Apr', x: 60, y: 700, width: 18 },
      { str: '08,', x: 80, y: 700, width: 12 },
      { str: '2026', x: 94, y: 700, width: 25 },
      { str: 'SHOPEE', x: 140, y: 700, width: 35 },
      { str: 'PH,', x: 178, y: 700, width: 15 },
      { str: 'MANDALUYONG,', x: 196, y: 700, width: 55 },
      { str: 'PH', x: 254, y: 700, width: 10 },
      { str: 'PHP', x: 460, y: 700, width: 20 },
      { str: '155.00', x: 483, y: 700, width: 30 },
    ]);
    expect(rowsFromTextItems(items)).toEqual([
      '"Apr 08, 2026","SHOPEE PH, MANDALUYONG, PH",PHP 155.00',
    ]);
  });

  it('keeps "PHP -23,815.21" as a single negative amount cell', () => {
    // UnionBank renders payment rows with the currency code, sign and
    // number all as adjacent text runs. The cell builder should join them
    // and then quote the result because of the embedded comma.
    const items = makeItems([
      { str: 'Mar', x: 60, y: 700, width: 18 },
      { str: '13,', x: 80, y: 700, width: 12 },
      { str: '2026', x: 94, y: 700, width: 25 },
      { str: 'Payment via UB Online UB1376959', x: 140, y: 700, width: 220 },
      { str: 'PHP', x: 430, y: 700, width: 20 },
      { str: '-23,815.21', x: 453, y: 700, width: 55 },
    ]);
    expect(rowsFromTextItems(items)).toEqual([
      '"Mar 13, 2026",Payment via UB Online UB1376959,"PHP -23,815.21"',
    ]);
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
