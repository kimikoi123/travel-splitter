import { CURRENCIES } from './currencies';

const CACHE_KEY = 'splittrip-rates';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const API_URL = 'https://api.frankfurter.app/latest?from=USD';

function getHardcodedRates() {
  const rates = {};
  for (const [code, curr] of Object.entries(CURRENCIES)) {
    rates[code] = curr.rate;
  }
  return rates;
}

function getCachedRates() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached && cached.rates && cached.timestamp) return cached;
  } catch {}
  return null;
}

function cacheRates(rates, timestamp) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp }));
  } catch {}
}

export async function fetchExchangeRates() {
  // Return fresh cache if available
  const cached = getCachedRates();
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return { rates: cached.rates, timestamp: cached.timestamp, source: 'cache' };
  }

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Frankfurter returns { base: "USD", rates: { EUR: 0.92, ... } } without USD itself
    const apiRates = { USD: 1, ...data.rates };

    // Merge with hardcoded so unsupported currencies (e.g. VND) still have a value
    const hardcoded = getHardcodedRates();
    const merged = { ...hardcoded, ...apiRates };

    const timestamp = Date.now();
    cacheRates(merged, timestamp);
    return { rates: merged, timestamp, source: 'api' };
  } catch {
    // If we have stale cache, prefer it over hardcoded
    if (cached) {
      return { rates: cached.rates, timestamp: cached.timestamp, source: 'cache' };
    }
    return { rates: getHardcodedRates(), timestamp: null, source: 'fallback' };
  }
}
