'use client';

import { DailyRecord, Country } from '@/data/types';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatters';

interface Props {
  data: DailyRecord[];
}

interface CountryRow {
  country: Country;
  orders: number;
  revenue: number;
  revenue_vat: number;
  cost: number;
  pno: number;
  cpa: number;
  share: number; // based on CZK-normalised revenue
}

const countryColors: Record<Country, string> = {
  at: '#ED2939',
  cz: '#D7141A',
  sk: '#0B4EA2',
  pl: '#DC143C',
  nl: '#FF4F00',
  de: '#000000',
};

const countryLabels: Record<Country, string> = {
  at: 'Österreich (AT)',
  cz: 'Česká republika (CZ)',
  sk: 'Slovensko (SK)',
  pl: 'Polska (PL)',
  nl: 'Nederland (NL)',
  de: 'Deutschland (DE)',
};

const countryCurrency: Record<Country, 'EUR' | 'CZK' | 'PLN'> = {
  at: 'EUR',
  cz: 'CZK',
  sk: 'EUR',
  pl: 'PLN',
  nl: 'EUR',
  de: 'EUR',
};

export default function CountryDistribution({ data }: Props) {
  const byCountry: Record<string, CountryRow> = {};

  for (const r of data) {
    if (!byCountry[r.country]) {
      byCountry[r.country] = { country: r.country, orders: 0, revenue: 0, revenue_vat: 0, cost: 0, pno: 0, cpa: 0, share: 0 };
    }
    byCountry[r.country].orders      += r.orders;
    byCountry[r.country].revenue     += r.revenue;
    byCountry[r.country].revenue_vat += r.revenue_vat;
    byCountry[r.country].cost        += r.cost;
  }

  const rows = (Object.values(byCountry) as CountryRow[]).map((r) => ({
    ...r,
    pno: r.revenue > 0 ? (r.cost / r.revenue) * 100 : 0,
    cpa: r.orders > 0 ? r.cost / r.orders : 0,
  }));

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  rows.forEach((r) => {
    r.share = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
  });

  const pnoColor = (pno: number) =>
    pno < 15 ? 'bg-emerald-50 text-emerald-700' :
    pno < 25 ? 'bg-amber-50 text-amber-700' :
    pno < 35 ? 'bg-orange-50 text-orange-700' :
    'bg-rose-50 text-rose-600';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">Distribuce podle země</h2>
      </div>

      {/* Stacked bar */}
      <div className="px-5 py-4">
        <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
          {rows.map((r) => (
            <div
              key={r.country}
              style={{ width: `${r.share}%`, backgroundColor: countryColors[r.country] }}
              className="flex items-center justify-center text-white text-xs font-bold transition-all"
              title={`${r.country.toUpperCase()}: ${r.share.toFixed(1)}%`}
            >
              {r.share > 10 ? `${r.share.toFixed(0)}%` : ''}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-2">
          {rows.map((r) => (
            <div key={r.country} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: countryColors[r.country] }} />
              <span className="text-xs text-slate-600">{r.country.toUpperCase()} ({r.share.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table — each country shown in its native currency */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-y border-blue-800">
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Země</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Objednávky</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Tržby bez DPH</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Tržby s DPH</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Náklady</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">PNO</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">CPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const cur = countryCurrency[r.country];
              const fc = (v: number) => formatCurrency(v, cur);
              return (
                <tr key={r.country} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: countryColors[r.country] }} />
                      <span className="text-slate-700 font-medium">{countryLabels[r.country]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatNumber(r.orders)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{fc(r.revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-800 font-semibold">{fc(r.revenue_vat)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{fc(r.cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${pnoColor(r.pno)}`}>
                      {formatPercent(r.pno)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{fc(r.cpa)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
