import { useState, useEffect, useCallback } from 'react';
import { fetchExchangeRates } from '../utils/exchangeRates';
import { CURRENCIES } from '../utils/currencies';
import type { ExchangeRates, RateSource } from '../types';

function getHardcodedRates(): ExchangeRates {
  const rates: ExchangeRates = {};
  for (const [code, curr] of Object.entries(CURRENCIES)) {
    rates[code] = curr.rate;
  }
  return rates;
}

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRates>(getHardcodedRates);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [source, setSource] = useState<RateSource>('fallback');

  const refresh = useCallback(async () => {
    setStatus('loading');
    const result = await fetchExchangeRates();
    setRates(result.rates);
    setLastUpdated(result.timestamp);
    setSource(result.source);
    setStatus(result.source === 'fallback' ? 'error' : 'ready');
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rates, status, lastUpdated, source, refresh };
}
