import { useState, useEffect, useCallback } from 'react';
import { fetchExchangeRates } from '../utils/exchangeRates';
import { CURRENCIES } from '../utils/currencies';

function getHardcodedRates() {
  const rates = {};
  for (const [code, curr] of Object.entries(CURRENCIES)) {
    rates[code] = curr.rate;
  }
  return rates;
}

export function useExchangeRates() {
  const [rates, setRates] = useState(getHardcodedRates);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [lastUpdated, setLastUpdated] = useState(null);
  const [source, setSource] = useState('fallback');

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
