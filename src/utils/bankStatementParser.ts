import { detectCategory } from './transactionParser';

export type BankFormat = 'bpi' | 'bdo' | 'gcash' | 'maya' | 'unionbank' | 'generic';

export interface ParsedStatementRow {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // always positive
  type: 'income' | 'expense';
  category: string;
  signature: string; // for dedup against existing transactions
  rawLine: string;
  warnings: string[];
}

export interface ParseResult {
  format: BankFormat;
  formatLabel: string;
  rows: ParsedStatementRow[];
  errors: { line: number; message: string; rawLine: string }[];
  totalIncome: number;
  totalExpense: number;
  // The headers that were used; helpful for the UI to show what was matched
  headersUsed: { date: string | null; description: string | null; amount: string | null; debit: string | null; credit: string | null };
}

// Column-name aliases. Header matching is case-insensitive against the trimmed,
// whitespace-collapsed version of each cell. First match wins.
const COLUMN_NAMES = {
  date: [
    'transaction date', 'posting date', 'date and time', 'datetime',
    'date time', 'posted date', 'value date', 'txn date', 'date',
  ],
  description: [
    'description', 'particulars', 'transaction details', 'details',
    'merchant', 'narrative', 'memo', 'remarks', 'transaction', 'type',
    'transaction type', 'reference', 'note',
  ],
  amount: ['amount', 'transaction amount', 'value', 'amount (php)'],
  debit: [
    'debit amount', 'debit', 'withdrawal', 'withdrawals', 'money out',
    'amount out', 'outflow', 'expense', 'debit (php)',
  ],
  credit: [
    'credit amount', 'credit', 'deposit', 'deposits', 'money in',
    'amount in', 'inflow', 'income', 'credit (php)',
  ],
};

const FORMAT_SIGNALS: { format: BankFormat; label: string; keywords: string[] }[] = [
  { format: 'gcash', label: 'GCash', keywords: ['gcash', 'g-cash', 'globe fintech'] },
  { format: 'maya', label: 'Maya', keywords: ['paymaya', 'maya bank', 'maya philippines'] },
  { format: 'bpi', label: 'BPI', keywords: ['bpi ', 'bank of the philippine islands', 'bpi online'] },
  { format: 'bdo', label: 'BDO', keywords: ['bdo unibank', 'bdo online', 'banco de oro'] },
  { format: 'unionbank', label: 'UnionBank', keywords: ['unionbank', 'union bank'] },
];

function normalizeHeader(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseDateCell(raw: string): { iso: string; warning?: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // For numeric formats, optionally strip a trailing time component
  // ("2026-01-15 12:30:00" → "2026-01-15"). We do this only for the numeric
  // branch — named-month formats contain spaces by design and must be
  // matched against the full string.
  const numericPart = trimmed.split(/[\sT]/)[0]?.trim() ?? trimmed;

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = numericPart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { iso: `${y}-${pad2(m)}-${pad2(d)}` };
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY (slash- or dash-separated, 1-2 digit parts, 2-4 digit year)
  const slashMatch = numericPart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y += 2000;
    // Disambiguate: if first part > 12, must be DMY. If second > 12, must be MDY.
    // Otherwise default to MDY (Filipino bank convention).
    if (a > 12 && b <= 12 && b >= 1) {
      return { iso: `${y}-${pad2(b)}-${pad2(a)}` };
    }
    if (b > 12 && a <= 12 && a >= 1) {
      return { iso: `${y}-${pad2(a)}-${pad2(b)}` };
    }
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const warning = a <= 12 && b <= 12 ? 'Ambiguous date (assumed MM/DD)' : undefined;
      return warning ? { iso: `${y}-${pad2(a)}-${pad2(b)}`, warning } : { iso: `${y}-${pad2(a)}-${pad2(b)}` };
    }
  }

  // "Jan 15, 2026" or "January 15, 2026"
  const namedMonthFirst = trimmed.toLowerCase().match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedMonthFirst && namedMonthFirst[1] && namedMonthFirst[2] && namedMonthFirst[3]) {
    const m = MONTH_MAP[namedMonthFirst[1]];
    const d = parseInt(namedMonthFirst[2], 10);
    const y = parseInt(namedMonthFirst[3], 10);
    if (m && d >= 1 && d <= 31) {
      return { iso: `${y}-${pad2(m)}-${pad2(d)}` };
    }
  }

  // "15 Jan 2026"
  const namedMonthSecond = trimmed.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})$/);
  if (namedMonthSecond && namedMonthSecond[1] && namedMonthSecond[2] && namedMonthSecond[3]) {
    const d = parseInt(namedMonthSecond[1], 10);
    const m = MONTH_MAP[namedMonthSecond[2]];
    const y = parseInt(namedMonthSecond[3], 10);
    if (m && d >= 1 && d <= 31) {
      return { iso: `${y}-${pad2(m)}-${pad2(d)}` };
    }
  }

  return null;
}

export function parseAmountCell(raw: string): { amount: number; isNegative: boolean } | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  let isNegative = false;
  // Accountant-style negatives: (250.00)
  if (/^\(.+\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  // Strip currency symbols and ISO codes
  s = s.replace(/[₱$€£¥]/g, '').replace(/\b(php|usd|eur|gbp|jpy)\b/gi, '').trim();
  // Strip thousands separators
  s = s.replace(/,/g, '');

  const n = parseFloat(s);
  if (!isFinite(n) || n < 0) return null;
  return { amount: n, isNegative };
}

// Splits a CSV line, honoring double-quoted fields and "" escapes.
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// Locates the row index of the headers within the first ~30 lines. Bank
// exports often prepend "Account: ...", "Statement period: ...", etc., so
// we skip non-data rows by looking for the first row that contains a
// recognized date column AND a recognized description column.
function findHeaderRow(lines: string[]): { index: number; headers: string[] } | null {
  const dateSet = new Set(COLUMN_NAMES.date);
  const descSet = new Set(COLUMN_NAMES.description);
  const limit = Math.min(lines.length, 30);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = parseCSVLine(line).map(normalizeHeader);
    const hasDate = cells.some((c) => dateSet.has(c));
    const hasDesc = cells.some((c) => descSet.has(c));
    if (hasDate && hasDesc) {
      return { index: i, headers: parseCSVLine(line).map((c) => c.trim()) };
    }
  }
  return null;
}

// Returns the index of the first header in `headers` that matches any name
// in `candidates` (case-insensitive). Returns -1 if no match.
function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand);
    if (idx >= 0) return idx;
  }
  return -1;
}

function detectFormatFromText(rawText: string, headers: string[]): { format: BankFormat; label: string } {
  const haystack = (rawText.slice(0, 2000) + ' ' + headers.join(' ')).toLowerCase();
  for (const sig of FORMAT_SIGNALS) {
    if (sig.keywords.some((k) => haystack.includes(k))) {
      return { format: sig.format, label: sig.label };
    }
  }
  return { format: 'generic', label: 'Generic CSV' };
}

export function generateSignature(date: string, amount: number, description: string): string {
  const desc = description.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${date}|${amount.toFixed(2)}|${desc}`;
}

export function parseStatement(csvText: string): ParseResult {
  const errors: ParseResult['errors'] = [];
  const rows: ParsedStatementRow[] = [];

  // Strip BOM and normalize line endings
  const text = csvText.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const allLines = text.split('\n');

  const headerSearch = findHeaderRow(allLines);
  if (!headerSearch) {
    return {
      format: 'generic',
      formatLabel: 'Generic CSV',
      rows: [],
      errors: [{ line: 0, message: 'Could not find a header row with both a date and a description column.', rawLine: '' }],
      totalIncome: 0,
      totalExpense: 0,
      headersUsed: { date: null, description: null, amount: null, debit: null, credit: null },
    };
  }

  const { index: headerIdx, headers } = headerSearch;
  const detected = detectFormatFromText(text, headers);

  const dateIdx = findColumnIndex(headers, COLUMN_NAMES.date);
  const descIdx = findColumnIndex(headers, COLUMN_NAMES.description);
  const amountIdx = findColumnIndex(headers, COLUMN_NAMES.amount);
  const debitIdx = findColumnIndex(headers, COLUMN_NAMES.debit);
  const creditIdx = findColumnIndex(headers, COLUMN_NAMES.credit);

  const headersUsed = {
    date: dateIdx >= 0 ? (headers[dateIdx] ?? null) : null,
    description: descIdx >= 0 ? (headers[descIdx] ?? null) : null,
    amount: amountIdx >= 0 ? (headers[amountIdx] ?? null) : null,
    debit: debitIdx >= 0 ? (headers[debitIdx] ?? null) : null,
    credit: creditIdx >= 0 ? (headers[creditIdx] ?? null) : null,
  };

  if (dateIdx === -1 || descIdx === -1) {
    return {
      format: detected.format,
      formatLabel: detected.label,
      rows: [],
      errors: [{ line: headerIdx + 1, message: 'Date or description column not found in headers.', rawLine: allLines[headerIdx] ?? '' }],
      totalIncome: 0,
      totalExpense: 0,
      headersUsed,
    };
  }

  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    return {
      format: detected.format,
      formatLabel: detected.label,
      rows: [],
      errors: [{ line: headerIdx + 1, message: 'No amount, debit, or credit column found.', rawLine: allLines[headerIdx] ?? '' }],
      totalIncome: 0,
      totalExpense: 0,
      headersUsed,
    };
  }

  let totalIncome = 0;
  let totalExpense = 0;

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const rawLine = allLines[i];
    if (!rawLine || rawLine.trim().length === 0) continue;

    const cells = parseCSVLine(rawLine);
    const dateRaw = cells[dateIdx]?.trim() ?? '';
    const descRaw = cells[descIdx]?.trim() ?? '';

    if (!dateRaw && !descRaw) continue; // blank-ish row, skip silently

    const dateParsed = parseDateCell(dateRaw);
    if (!dateParsed) {
      errors.push({ line: i + 1, message: `Could not parse date "${dateRaw}"`, rawLine });
      continue;
    }

    let amount: number | null = null;
    let isNegative = false;

    if (amountIdx >= 0) {
      const amountParsed = parseAmountCell(cells[amountIdx] ?? '');
      if (amountParsed && amountParsed.amount > 0) {
        amount = amountParsed.amount;
        isNegative = amountParsed.isNegative;
      }
    }
    if (amount === null && debitIdx >= 0) {
      const debitParsed = parseAmountCell(cells[debitIdx] ?? '');
      if (debitParsed && debitParsed.amount > 0) {
        amount = debitParsed.amount;
        isNegative = true;
      }
    }
    if (amount === null && creditIdx >= 0) {
      const creditParsed = parseAmountCell(cells[creditIdx] ?? '');
      if (creditParsed && creditParsed.amount > 0) {
        amount = creditParsed.amount;
        isNegative = false;
      }
    }

    if (amount === null) {
      errors.push({ line: i + 1, message: 'No usable amount in row', rawLine });
      continue;
    }

    const description = descRaw || '(no description)';
    const categoryGuess = detectCategory(description);
    // Type from sign overrides keyword-based type detection. The bank
    // statement is authoritative — if the row is a debit, it's an expense
    // even if the description happens to contain a keyword like "salary".
    const type: 'income' | 'expense' = isNegative ? 'expense' : 'income';
    // Pick a category that fits the detected type. If detectCategory
    // returned a category for the wrong type, fall back to a generic one.
    let category = categoryGuess.category;
    if (type === 'expense' && (category === 'salary' || category === 'freelance' || category === 'gift' || category === 'refund')) {
      category = 'other';
    } else if (type === 'income' && !(category === 'salary' || category === 'freelance' || category === 'gift' || category === 'refund')) {
      category = 'other-income';
    }

    const warnings: string[] = [];
    if (dateParsed.warning) warnings.push(dateParsed.warning);

    const row: ParsedStatementRow = {
      date: dateParsed.iso,
      description,
      amount,
      type,
      category,
      signature: generateSignature(dateParsed.iso, amount, description),
      rawLine,
      warnings,
    };

    rows.push(row);
    if (type === 'income') totalIncome += amount;
    else totalExpense += amount;
  }

  return {
    format: detected.format,
    formatLabel: detected.label,
    rows,
    errors,
    totalIncome,
    totalExpense,
    headersUsed,
  };
}
