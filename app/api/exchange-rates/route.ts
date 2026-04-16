import { NextResponse } from 'next/server';

// Fetches EUR/CZK and PLN/CZK rates from Frankfurter (ECB data, free, no key needed)
// Cached for 24 hours via Next.js fetch cache

export async function GET() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?base=CZK&symbols=EUR,PLN', {
      next: { revalidate: 86400 }, // 24h cache
    });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const data = await res.json();

    // data.rates = { EUR: 0.040..., PLN: 0.17... }  (CZK per 1 EUR/PLN is inverted)
    const eurRate = data.rates?.EUR;
    const plnRate = data.rates?.PLN;

    if (!eurRate || !plnRate) throw new Error('Missing rates in response');

    return NextResponse.json({
      EUR_CZK: Math.round((1 / eurRate) * 100) / 100,   // 1 EUR = X CZK
      PLN_CZK: Math.round((1 / plnRate) * 100) / 100,   // 1 PLN = X CZK
      date: data.date,
    });
  } catch (err) {
    // Fallback to approximate fixed rates if API fails
    console.error('Exchange rate fetch failed:', err);
    return NextResponse.json({
      EUR_CZK: 25.0,
      PLN_CZK: 5.85,
      date: null,
      fallback: true,
    });
  }
}
