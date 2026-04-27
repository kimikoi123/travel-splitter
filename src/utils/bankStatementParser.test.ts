import { describe, it, expect } from 'vitest';
import {
  parseStatement,
  parseDateCell,
  parseAmountCell,
  generateSignature,
} from './bankStatementParser';

describe('parseDateCell', () => {
  it('parses ISO YYYY-MM-DD', () => {
    expect(parseDateCell('2026-01-15')).toEqual({ iso: '2026-01-15' });
  });

  it('parses ISO with time component', () => {
    expect(parseDateCell('2026-01-15 12:30:00')).toEqual({ iso: '2026-01-15' });
    expect(parseDateCell('2026-01-15T12:30:00Z')).toEqual({ iso: '2026-01-15' });
  });

  it('parses MM/DD/YYYY (default for PH bank exports)', () => {
    const result = parseDateCell('01/15/2026');
    expect(result?.iso).toBe('2026-01-15');
  });

  it('flags ambiguous slash dates with a warning', () => {
    // "05/06/2026" — could be May 6 or Jun 5. Default to MDY (May 6) but warn.
    const result = parseDateCell('05/06/2026');
    expect(result?.iso).toBe('2026-05-06');
    expect(result?.warning).toMatch(/ambiguous/i);
  });

  it('infers DMY when first part > 12', () => {
    // "15/01/2026" — first part 15 > 12, so DMY
    const result = parseDateCell('15/01/2026');
    expect(result?.iso).toBe('2026-01-15');
    expect(result?.warning).toBeUndefined();
  });

  it('parses named-month dates: Jan 15, 2026', () => {
    expect(parseDateCell('Jan 15, 2026')?.iso).toBe('2026-01-15');
    expect(parseDateCell('January 15, 2026')?.iso).toBe('2026-01-15');
  });

  it('parses named-month dates: 15 Jan 2026', () => {
    expect(parseDateCell('15 Jan 2026')?.iso).toBe('2026-01-15');
  });

  it('handles 2-digit years', () => {
    expect(parseDateCell('01/15/26')?.iso).toBe('2026-01-15');
  });

  it('returns null for unparseable input', () => {
    expect(parseDateCell('not a date')).toBeNull();
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('99/99/9999')).toBeNull();
  });

  it('infers year for short "Mon DD" forms when defaultYear is provided', () => {
    expect(parseDateCell('Apr 08', 2026)?.iso).toBe('2026-04-08');
    expect(parseDateCell('Mar 16', 2026)?.iso).toBe('2026-03-16');
    expect(parseDateCell('December 31', 2025)?.iso).toBe('2025-12-31');
  });

  it('marks year-inferred dates with a warning', () => {
    expect(parseDateCell('Apr 08', 2026)?.warning).toMatch(/inferred/i);
  });

  it('handles "DD Mon" (day-first short form)', () => {
    expect(parseDateCell('08 Apr', 2026)?.iso).toBe('2026-04-08');
    expect(parseDateCell('16 March', 2026)?.iso).toBe('2026-03-16');
  });

  it('does not infer year when defaultYear is missing', () => {
    expect(parseDateCell('Apr 08')).toBeNull();
  });
});

describe('parseAmountCell', () => {
  it('parses plain numbers', () => {
    expect(parseAmountCell('250')).toEqual({ amount: 250, isNegative: false });
    expect(parseAmountCell('250.50')).toEqual({ amount: 250.5, isNegative: false });
  });

  it('strips comma thousands separators', () => {
    expect(parseAmountCell('1,234.50')).toEqual({ amount: 1234.5, isNegative: false });
    expect(parseAmountCell('1,234,567.89')).toEqual({ amount: 1234567.89, isNegative: false });
  });

  it('parses minus-prefixed negatives', () => {
    expect(parseAmountCell('-250.00')).toEqual({ amount: 250, isNegative: true });
  });

  it('parses accountant-style parenthesized negatives', () => {
    expect(parseAmountCell('(250.00)')).toEqual({ amount: 250, isNegative: true });
  });

  it('strips currency symbols', () => {
    expect(parseAmountCell('₱250.00')).toEqual({ amount: 250, isNegative: false });
    expect(parseAmountCell('PHP 1,234.50')).toEqual({ amount: 1234.5, isNegative: false });
    expect(parseAmountCell('$50')).toEqual({ amount: 50, isNegative: false });
  });

  it('parses negatives with the currency code before the minus (UnionBank credit card)', () => {
    // UnionBank renders payment rows as "PHP -23,815.21". The currency code
    // sits before the sign, so the leading-minus check has to come AFTER
    // currency stripping.
    expect(parseAmountCell('PHP -23,815.21')).toEqual({ amount: 23815.21, isNegative: true });
    expect(parseAmountCell('PHP -100')).toEqual({ amount: 100, isNegative: true });
    expect(parseAmountCell('₱ -500.50')).toEqual({ amount: 500.5, isNegative: true });
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseAmountCell('')).toBeNull();
    expect(parseAmountCell('   ')).toBeNull();
    expect(parseAmountCell('not a number')).toBeNull();
  });
});

describe('generateSignature', () => {
  it('produces stable signatures regardless of description casing/spacing', () => {
    const a = generateSignature('2026-01-15', 250, 'GRAB FOOD');
    const b = generateSignature('2026-01-15', 250, '  grab   food  ');
    expect(a).toBe(b);
  });

  it('rounds amounts consistently to 2 decimals', () => {
    const a = generateSignature('2026-01-15', 250, 'Test');
    const b = generateSignature('2026-01-15', 250.0, 'Test');
    const c = generateSignature('2026-01-15', 250.001, 'Test');
    expect(a).toBe(b);
    // 250.001 rounds to 250.00, so it should match too
    expect(a).toBe(c);
  });

  it('differs across different rows', () => {
    const a = generateSignature('2026-01-15', 250, 'Test');
    const b = generateSignature('2026-01-16', 250, 'Test');
    const c = generateSignature('2026-01-15', 251, 'Test');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('parseStatement – BPI-style single-amount column', () => {
  it('parses a basic statement with signed amounts', () => {
    const csv = `Transaction Date,Description,Amount,Running Balance
01/15/2026,GRAB FOOD,-250.00,4750.00
01/16/2026,Salary deposit,30000.00,34750.00
01/17/2026,JOLLIBEE,-180.50,34569.50`;

    const result = parseStatement(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);

    const r0 = result.rows[0]!;
    expect(r0.date).toBe('2026-01-15');
    expect(r0.description).toBe('GRAB FOOD');
    expect(r0.amount).toBe(250);
    expect(r0.type).toBe('expense');
    expect(r0.category).toBe('transport'); // 'grab' keyword

    const r1 = result.rows[1]!;
    expect(r1.type).toBe('income');
    expect(r1.amount).toBe(30000);
    expect(r1.category).toBe('salary');

    const r2 = result.rows[2]!;
    expect(r2.type).toBe('expense');
    expect(r2.category).toBe('food'); // 'jollibee'
  });

  it('computes totals correctly', () => {
    const csv = `Transaction Date,Description,Amount
01/15/2026,A,-100
01/16/2026,B,200
01/17/2026,C,-50`;
    const result = parseStatement(csv);
    expect(result.totalExpense).toBe(150);
    expect(result.totalIncome).toBe(200);
  });
});

describe('parseStatement – BDO-style debit/credit columns', () => {
  it('classifies rows by which column has a value', () => {
    const csv = `Posting Date,Transaction Date,Description,Debit,Credit,Balance
01/15/2026,01/15/2026,JOLLIBEE,250.00,,4750.00
01/16/2026,01/16/2026,Salary,,30000.00,34750.00`;

    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.type).toBe('expense');
    expect(result.rows[0]!.amount).toBe(250);
    expect(result.rows[1]!.type).toBe('income');
    expect(result.rows[1]!.amount).toBe(30000);
  });
});

describe('parseStatement – GCash-style with metadata header', () => {
  it('skips metadata rows and finds the real header', () => {
    const csv = `GCash Transaction History
Account: 09xx-xxx-xxxx
Period: 2026-01-01 to 2026-01-31

Date and Time,Description,Reference No,Debit,Credit,Balance
2026-01-15 12:30:00,Send to Juan,123456789,250.00,,500.00
2026-01-16 10:00:00,Cash In via BPI,234567890,,1000.00,1500.00`;

    const result = parseStatement(csv);
    expect(result.format).toBe('gcash');
    expect(result.formatLabel).toBe('GCash');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.date).toBe('2026-01-15');
    expect(result.rows[0]!.type).toBe('expense');
    expect(result.rows[1]!.type).toBe('income');
  });
});

describe('parseStatement – CSV edge cases', () => {
  it('handles quoted fields with commas', () => {
    const csv = `Date,Description,Amount
01/15/2026,"Lazada: shoes, socks, and shirt",-1500.00`;
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.description).toBe('Lazada: shoes, socks, and shirt');
    expect(result.rows[0]!.amount).toBe(1500);
  });

  it('handles BOM-prefixed CSV', () => {
    const csv = '﻿Date,Description,Amount\n01/15/2026,Test,-100';
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.amount).toBe(100);
  });

  it('handles CRLF line endings', () => {
    const csv = 'Date,Description,Amount\r\n01/15/2026,Test,-100\r\n';
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(1);
  });

  it('skips blank lines', () => {
    const csv = `Date,Description,Amount

01/15/2026,A,-100

01/16/2026,B,-200
`;
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('records errors for unparseable rows but keeps going', () => {
    const csv = `Date,Description,Amount
01/15/2026,Good row,-100
not-a-date,Bad date,-200
01/17/2026,Another good row,-300`;
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/date/i);
  });

  it('returns an error result when no header row is found', () => {
    const csv = `not a real csv
just some random text
nothing useful here`;
    const result = parseStatement(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('parseStatement – credit card statement with comma-dates and short dates', () => {
  it('parses long-form dates that contain a comma', () => {
    const csv = `Transaction Date,Description,Amount
"Mar 16, 2026","7-ELEVEN, METRO CEBU",PHP 75.00
"Mar 14, 2026","SHOPEE PH",PHP 363.00`;
    const result = parseStatement(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.date).toBe('2026-03-16');
    expect(result.rows[1]!.date).toBe('2026-03-14');
  });

  it('uses any 4-digit year in the file as a fallback for short-date rows', () => {
    const csv = `Transaction Date,Description,Amount
"Mar 16, 2026","7-ELEVEN",PHP 75.00
"Apr 08","Some charge",PHP 200.00`;
    const result = parseStatement(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]!.date).toBe('2026-04-08');
    expect(result.rows[1]!.warnings).toContain('Year inferred from statement');
  });

  it('skips metadata rows (no amount) silently instead of erroring', () => {
    const csv = `Transaction Date,Description,Amount
"Statement period",Apr 01 - Apr 30,
"Mar 16, 2026","7-ELEVEN",PHP 75.00`;
    const result = parseStatement(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });
});

describe('parseStatement – type override', () => {
  it('overrides keyword-based income type when amount is negative', () => {
    // Description mentions "Salary" but it's a debit — must be expense.
    // (e.g., a salary garnishment or refund-of-salary scenario)
    const csv = `Date,Description,Amount
01/15/2026,Salary advance repayment,-5000`;
    const result = parseStatement(csv);
    expect(result.rows[0]!.type).toBe('expense');
    // Category should fall back to "other" because "salary" is income-only
    expect(result.rows[0]!.category).toBe('other');
  });

  it('overrides keyword-based expense type when amount is positive', () => {
    const csv = `Date,Description,Amount
01/15/2026,Refund from Grab,500`;
    const result = parseStatement(csv);
    expect(result.rows[0]!.type).toBe('income');
    // 'refund' is an income category, so it stays
    expect(result.rows[0]!.category).toBe('refund');
  });
});

describe('parseStatement – UnionBank credit card statement', () => {
  // Fixture mirrors what pdfRowAssembly emits for a UnionBank Rewards Platinum
  // Visa Credit Card statement of account: metadata at the top (statement
  // date, card details, summary, due date), then a "DATE,DESCRIPTION,AMOUNT"
  // header, then transaction rows. The page-2 column header is also included
  // mid-data to verify it gets silently skipped.
  const unionbankCC = `UnionBank
Statement of Account
"Statement Date: April 08, 2026",Available Points*
13132 PTS
Rewards Platinum Visa Credit Card
CARD NUMBER
**** **** **** 8928
NAME
KIMUEL ARVIN SUMBILLO ANQUI
CREDIT LIMIT
"PHP 80,000"
Summary
Previous Balance,"PHP 23,815.21"
Purchases and Advances,"PHP 21,527.62"
Payments & Credits,"PHP -23,815.21"
Due Date,Minimum Amount Due,Total Amount Due
"April 27, 2026",PHP 531.88,"PHP 21,527.62"
Important Reminder: Paying less than the total amount due will increase the amount of interest and other charges you pay and the time it takes to repay your balance.
Transactions
DATE,DESCRIPTION,AMOUNT
"Apr 08, 2026","SHOPEE PH, MANDALUYONG, PH",PHP 155.00
"Apr 08, 2026",(08/24) DIGIMAP-IL CORSO CEBU,"PHP 1,978.75"
"Apr 07, 2026","PETRON 1029031 F, SIBULAN, PH","PHP 3,000.00"
"Apr 07, 2026","RAILWAY, RAILWAY.COM, US (USD 5.00)",PHP 311.27
"Apr 06, 2026","LAMBOJON TERRACES SQJR P, SIQUIJOR, PH","PHP 4,930.00"
DATE,DESCRIPTION,AMOUNT
"Mar 17, 2026","Google CapCut Video E, London, GB",PHP 95.95
"Mar 13, 2026",Payment via UB Online UB1376959,"PHP -23,815.21"
"Mar 07, 2026","UDEMY: ONLINE COURSES, UDEMY.COM, US",PHP 483.79`;

  it('detects the credit card format', () => {
    const result = parseStatement(unionbankCC);
    expect(result.format).toBe('unionbank');
    expect(result.formatLabel).toBe('UnionBank');
    expect(result.isCreditCard).toBe(true);
  });

  it('captures every transaction row (and skips repeated mid-statement headers)', () => {
    const result = parseStatement(unionbankCC);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(8);
  });

  it('treats a positive charge as an expense (cardholder spent money)', () => {
    const result = parseStatement(unionbankCC);
    const shopee = result.rows[0]!;
    expect(shopee.date).toBe('2026-04-08');
    expect(shopee.description).toBe('SHOPEE PH, MANDALUYONG, PH');
    expect(shopee.amount).toBe(155);
    expect(shopee.type).toBe('expense');
  });

  it('treats a negative payment row as income (payment received against the card balance)', () => {
    const result = parseStatement(unionbankCC);
    const payment = result.rows.find((r) => r.description.includes('Payment via UB Online'))!;
    expect(payment).toBeDefined();
    expect(payment.date).toBe('2026-03-13');
    expect(payment.amount).toBe(23815.21);
    expect(payment.type).toBe('income');
  });

  it('preserves merchant descriptions that contain commas', () => {
    const result = parseStatement(unionbankCC);
    const railway = result.rows.find((r) => r.description.startsWith('RAILWAY'))!;
    expect(railway).toBeDefined();
    expect(railway.description).toBe('RAILWAY, RAILWAY.COM, US (USD 5.00)');
    expect(railway.amount).toBe(311.27);
    expect(railway.type).toBe('expense');
  });

  it('parses thousands-separator amounts on credit-card charges', () => {
    const result = parseStatement(unionbankCC);
    const lambojon = result.rows.find((r) => r.description.startsWith('LAMBOJON'))!;
    expect(lambojon.amount).toBe(4930);
    expect(lambojon.type).toBe('expense');
  });

  it('does not flip the sign on a normal debit-account statement', () => {
    // Sanity: the debit-account fixture from the BPI suite must keep its
    // original sign convention even though the parser now knows about CCs.
    const csv = `Transaction Date,Description,Amount
01/15/2026,GRAB FOOD,-250.00
01/16/2026,Salary deposit,30000.00`;
    const result = parseStatement(csv);
    expect(result.isCreditCard).toBe(false);
    expect(result.rows[0]!.type).toBe('expense'); // negative → expense
    expect(result.rows[1]!.type).toBe('income');  // positive → income
  });
});

describe('parseStatement – signature dedup', () => {
  it('produces signatures that match generateSignature for identical rows', () => {
    const csv = `Date,Description,Amount
01/15/2026,Test,-100`;
    const result = parseStatement(csv);
    const expected = generateSignature('2026-01-15', 100, 'Test');
    expect(result.rows[0]!.signature).toBe(expected);
  });
});
