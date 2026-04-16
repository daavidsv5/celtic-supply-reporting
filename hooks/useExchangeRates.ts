'use client';

import { useState, useEffect } from 'react';

export interface ExchangeRates {
  EUR_CZK: number;  // 1 EUR = X CZK
  PLN_CZK: number;  // 1 PLN = X CZK
}

const CACHE_KEY = 'exchange_rates_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const FALLBACK: ExchangeRates = { EUR_CZK: 25.0, PLN_CZK: 5.85 };

export function useExchangeRates(): ExchangeRates {
  const [rates, setRates] = useState<ExchangeRates>(() => {
    // Load from localStorage cache on init
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { rates: r, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return r;
      }
    } catch { /* ignore */ }
    return FALLBACK;
  });

  useEffect(() => {
    // Check cache age
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return; // still fresh
      }
    } catch { /* re-fetch */ }

    fetch('/api/exchange-rates')
      .then(r => r.json())
      .then(data => {
        const fresh: ExchangeRates = { EUR_CZK: data.EUR_CZK, PLN_CZK: data.PLN_CZK };
        setRates(fresh);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ rates: fresh, ts: Date.now() }));
        } catch { /* ignore */ }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  return rates;
}

// Convert a value from its native currency to CZK
export function toCZK(value: number, currency: 'CZK' | 'EUR' | 'PLN', rates: ExchangeRates): number {
  if (currency === 'CZK') return value;
  if (currency === 'EUR') return value * rates.EUR_CZK;
  if (currency === 'PLN') return value * rates.PLN_CZK;
  return value;
}
