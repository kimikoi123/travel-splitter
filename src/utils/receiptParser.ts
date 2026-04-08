export interface ReceiptData {
  amount: number | null;
  date: string | null;
  merchant: string | null;
  category: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// --- Amount extraction ---

const EXCLUDE_LINE_PATTERNS = [
  /\b(change|vat|tax|discount|tendered|cash\s*received|subtotal|sub\s*total)\b/i,
];

const TOTAL_PATTERNS: { regex: RegExp; priority: number }[] = [
  { regex: /grand\s*total\s*:?\s*₱?\s*([\d,]+\.?\d*)/i, priority: 3 },
  { regex: /amount\s*due\s*:?\s*₱?\s*([\d,]+\.?\d*)/i, priority: 3 },
  { regex: /total\s*due\s*:?\s*₱?\s*([\d,]+\.?\d*)/i, priority: 3 },
  { regex: /net\s*amount\s*:?\s*₱?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { regex: /total\s*:?\s*₱?\s*([\d,]+\.?\d*)/i, priority: 1 },
];

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, '')) || 0;
}

function extractAmount(text: string): { amount: number; confidence: 'high' | 'medium' | 'low' } | null {
  const lines = text.split('\n');

  // Find all total-labeled amounts, sorted by priority then position (later = better)
  let bestMatch: { amount: number; priority: number; lineIndex: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip excluded lines
    if (EXCLUDE_LINE_PATTERNS.some((p) => p.test(line))) continue;

    for (const { regex, priority } of TOTAL_PATTERNS) {
      const match = line.match(regex);
      if (match?.[1]) {
        const amount = parseAmount(match[1]);
        if (amount <= 0) continue;
        if (
          !bestMatch ||
          priority > bestMatch.priority ||
          (priority === bestMatch.priority && i > bestMatch.lineIndex)
        ) {
          bestMatch = { amount, priority, lineIndex: i };
        }
      }
    }
  }

  if (bestMatch) {
    return { amount: bestMatch.amount, confidence: bestMatch.priority >= 2 ? 'high' : 'medium' };
  }

  // Fallback: find the largest number on the receipt
  const allNumbers: number[] = [];
  for (const line of lines) {
    if (EXCLUDE_LINE_PATTERNS.some((p) => p.test(line))) continue;
    const matches = line.matchAll(/₱?\s*([\d,]+\.\d{2})\b/g);
    for (const m of matches) {
      if (m[1]) {
        const val = parseAmount(m[1]);
        if (val > 0) allNumbers.push(val);
      }
    }
  }

  if (allNumbers.length > 0) {
    return { amount: Math.max(...allNumbers), confidence: 'low' };
  }

  return null;
}

// --- Date extraction ---

const MONTH_NAMES: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function extractDate(text: string): string | null {
  // YYYY-MM-DD
  const iso = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (mdy) {
    const month = mdy[1]!.padStart(2, '0');
    const day = mdy[2]!.padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }

  // Mon DD, YYYY or DD Mon YYYY
  const named = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (named) {
    const monthNum = MONTH_NAMES[named[1]!.slice(0, 3).toLowerCase()];
    if (monthNum) {
      return `${named[3]}-${monthNum}-${named[2]!.padStart(2, '0')}`;
    }
  }

  const namedReverse = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (namedReverse) {
    const monthNum = MONTH_NAMES[namedReverse[2]!.slice(0, 3).toLowerCase()];
    if (monthNum) {
      return `${namedReverse[3]}-${monthNum}-${namedReverse[1]!.padStart(2, '0')}`;
    }
  }

  return null;
}

// --- Merchant extraction ---

const SKIP_MERCHANT_PATTERNS = [
  /^\s*$/,
  /^[\d\s\-./]+$/, // only numbers/punctuation
  /\btin\b/i,
  /\bvat\b/i,
  /\bmin\b.*\bno\b/i,
  /\bOR\s*#/i,
  /\bSI\s*#/i,
  /^\d{3,}/, // starts with 3+ digits (likely address/phone)
  /\b(street|st\.|ave\.|blvd|road|city|brgy)\b/i,
];

function extractMerchant(text: string): string | null {
  const lines = text.split('\n').slice(0, 5); // check first 5 lines only

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    if (SKIP_MERCHANT_PATTERNS.some((p) => p.test(trimmed))) continue;
    // Return the first viable line, title-cased
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 50);
  }

  return null;
}

// --- Category detection (reuses keyword logic from transactionParser) ---

const CATEGORY_KEYWORDS: Record<string, string> = {
  starbucks: 'food', coffee: 'food', lunch: 'food', dinner: 'food', restaurant: 'food',
  groceries: 'food', jollibee: 'food', mcdonald: 'food', pizza: 'food', burger: 'food',
  cafe: 'food', food: 'food', foodpanda: 'food', grabfood: 'food',
  '7-eleven': 'food', 'seven eleven': 'food', ministop: 'food',
  uber: 'transport', grab: 'transport', taxi: 'transport', gas: 'transport',
  fuel: 'transport', parking: 'transport', bus: 'transport', shell: 'transport',
  petron: 'transport', caltex: 'transport', angkas: 'transport',
  amazon: 'shopping', shopee: 'shopping', lazada: 'shopping', mall: 'shopping',
  uniqlo: 'shopping', sm: 'shopping', robinsons: 'shopping',
  meralco: 'bills', pldt: 'bills', globe: 'bills', smart: 'bills',
  electric: 'bills', water: 'bills', internet: 'bills',
  cinema: 'entertainment', movie: 'entertainment',
  pharmacy: 'health', mercury: 'health', watsons: 'health', hospital: 'health',
  medicine: 'health', generika: 'health',
};

function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return null;
}

// --- Main parser ---

export function parseReceiptText(rawText: string): ReceiptData {
  const amountResult = extractAmount(rawText);
  const date = extractDate(rawText);
  const merchant = extractMerchant(rawText);
  const category = detectCategory(rawText);

  return {
    amount: amountResult?.amount ?? null,
    date,
    merchant,
    category,
    confidence: amountResult?.confidence ?? 'low',
  };
}
