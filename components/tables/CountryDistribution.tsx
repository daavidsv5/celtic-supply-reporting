'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { DailyRecord, Country } from '@/data/types';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatters';

interface MarginTotals {
  purchaseCost: number;
  marginRev: number;
}

interface Props {
  data: DailyRecord[];
  prevData?: DailyRecord[];
  marginCur?: Record<string, MarginTotals>;
  prevMarginCur?: Record<string, MarginTotals>;
  hasPrevData?: boolean;
}

interface CountryRow {
  country: Country;
  orders: number;       prevOrders: number;
  revenue: number;      prevRevenue: number;
  revenue_vat: number;  prevRevenue_vat: number;
  cost: number;         prevCost: number;
  purchaseCost: number; prevPurchaseCost: number;
  marginRev: number;    prevMarginRev: number;
  pno: number;          prevPno: number;
  cpa: number;          prevCpa: number;
  share: number;
}

const countryColors: Record<Country, string> = {
  at: '#DC2626',
  cz: '#2563EB',
  sk: '#16A34A',
  pl: '#9333EA',
  nl: '#EA580C',
  de: '#374151',
};

const countryLabels: Record<Country, string> = {
  at: 'Österreich (AT)',
  cz: 'Česká republika (CZ)',
  sk: 'Slovensko (SK)',
  pl: 'Polska (PL)',
  nl: 'Nederland (NL)',
  de: 'Deutschland (DE)',
};


function yoyPct(cur: number, prev: number) {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function YoyBadge({ cur, prev, invertColors }: { cur: number; prev: number; invertColors?: boolean }) {
  const pct = yoyPct(cur, prev);
  if (pct === null) return <span className="text-[10px] text-slate-400">—</span>;
  const positive = invertColors ? pct <= 0 : pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded ${
      positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
    }`}>
      {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function PpBadge({ cur, prev, invertColors }: { cur: number; prev: number; invertColors?: boolean }) {
  const diff = cur - prev;
  if (prev === 0) return <span className="text-[10px] text-slate-400">—</span>;
  const positive = invertColors ? diff <= 0 : diff >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded ${
      positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
    }`}>
      {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {diff >= 0 ? '+' : ''}{diff.toFixed(1)} pp
    </span>
  );
}

const pnoColor = (pno: number) =>
  pno < 15 ? 'bg-emerald-50 text-emerald-700' :
  pno < 25 ? 'bg-amber-50 text-amber-700' :
  pno < 35 ? 'bg-orange-50 text-orange-700' :
  'bg-rose-50 text-rose-600';

export default function CountryDistribution({ data, prevData = [], marginCur = {}, prevMarginCur = {}, hasPrevData = false }: Props) {
  const aggregate = (records: DailyRecord[]) => {
    const byCountry: Record<string, Omit<CountryRow, 'pno' | 'cpa' | 'share' | 'prevPno' | 'prevCpa' | 'purchaseCost' | 'prevPurchaseCost' | 'marginRev' | 'prevMarginRev'>> = {};
    for (const r of records) {
      if (!byCountry[r.country]) {
        byCountry[r.country] = { country: r.country, orders: 0, prevOrders: 0, revenue: 0, prevRevenue: 0, revenue_vat: 0, prevRevenue_vat: 0, cost: 0, prevCost: 0 };
      }
      byCountry[r.country].orders      += r.orders;
      byCountry[r.country].revenue     += r.revenue;
      byCountry[r.country].revenue_vat += r.revenue_vat;
      byCountry[r.country].cost        += r.cost;
    }
    return byCountry;
  };

  const cur  = aggregate(data);
  const prev = aggregate(prevData);

  const allCountries = new Set([...Object.keys(cur), ...Object.keys(prev)]) as Set<Country>;

  const rows: CountryRow[] = Array.from(allCountries).map(country => {
    const c = cur[country]  ?? { country, orders: 0, prevOrders: 0, revenue: 0, prevRevenue: 0, revenue_vat: 0, prevRevenue_vat: 0, cost: 0, prevCost: 0 };
    const p = prev[country] ?? { country, orders: 0, prevOrders: 0, revenue: 0, prevRevenue: 0, revenue_vat: 0, prevRevenue_vat: 0, cost: 0, prevCost: 0 };
    const mc  = marginCur[country]  ?? { purchaseCost: 0, marginRev: 0 };
    const mp  = prevMarginCur[country] ?? { purchaseCost: 0, marginRev: 0 };
    return {
      country,
      orders:       c.orders,      prevOrders:      p.orders,
      revenue:      c.revenue,     prevRevenue:      p.revenue,
      revenue_vat:  c.revenue_vat, prevRevenue_vat:  p.revenue_vat,
      cost:         c.cost,        prevCost:         p.cost,
      purchaseCost: mc.purchaseCost, prevPurchaseCost: mp.purchaseCost,
      marginRev:    mc.marginRev,    prevMarginRev:    mp.marginRev,
      pno:          c.revenue > 0 ? (c.cost / c.revenue) * 100 : 0,
      prevPno:      p.revenue > 0 ? (p.cost / p.revenue) * 100 : 0,
      cpa:          c.orders > 0  ? c.cost / c.orders  : 0,
      prevCpa:      p.orders > 0  ? p.cost / p.orders  : 0,
      share:        0,
    };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  rows.forEach(r => { r.share = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0; });
  rows.sort((a, b) => b.revenue - a.revenue);

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
        <div className="flex gap-4 mt-2 flex-wrap">
          {rows.map((r) => (
            <div key={r.country} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: countryColors[r.country] }} />
              <span className="text-xs text-slate-600">{r.country.toUpperCase()} ({r.share.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-y border-blue-800">
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Země</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Objednávky</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Tržby bez DPH</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Tržby s DPH</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">AOV</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Náklady</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">PNO</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">CPA</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Marže %</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Hrubý zisk</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Hrubý zisk %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const fc = (v: number) => formatCurrency(v, 'CZK');
              const grossProfit     = r.marginRev     > 0 ? (r.marginRev     - r.purchaseCost)     - r.cost     : 0;
              const prevGrossProfit = r.prevMarginRev > 0 ? (r.prevMarginRev - r.prevPurchaseCost) - r.prevCost : 0;
              const grossPct        = r.marginRev     > 0 ? (grossProfit     / r.marginRev)     * 100 : 0;
              const prevGrossPct    = r.prevMarginRev > 0 ? (prevGrossProfit / r.prevMarginRev) * 100 : 0;
              const showMargin      = r.marginRev > 0;
              const aov         = r.orders     > 0 ? r.revenue     / r.orders     : 0;
              const prevAov     = r.prevOrders > 0 ? r.prevRevenue / r.prevOrders : 0;
              const marzePct    = r.marginRev     > 0 ? ((r.marginRev     - r.purchaseCost)     / r.marginRev)     * 100 : 0;
              const prevMarzePct= r.prevMarginRev > 0 ? ((r.prevMarginRev - r.prevPurchaseCost) / r.prevMarginRev) * 100 : 0;
              return (
                <tr key={r.country} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: countryColors[r.country] }} />
                      <span className="text-slate-700 font-medium">{countryLabels[r.country]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-600">{formatNumber(r.orders)}</span>
                      {hasPrevData && <YoyBadge cur={r.orders} prev={r.prevOrders} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-800 font-semibold">{fc(r.revenue)}</span>
                      {hasPrevData && <YoyBadge cur={r.revenue} prev={r.prevRevenue} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-500">{fc(r.revenue_vat)}</span>
                      {hasPrevData && <YoyBadge cur={r.revenue_vat} prev={r.prevRevenue_vat} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-600 font-medium">{fc(aov)}</span>
                      {hasPrevData && <YoyBadge cur={aov} prev={prevAov} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-500">{fc(r.cost)}</span>
                      {hasPrevData && <YoyBadge cur={r.cost} prev={r.prevCost} invertColors />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${pnoColor(r.pno)}`}>
                        {formatPercent(r.pno)}
                      </span>
                      {hasPrevData && r.prevPno > 0 && <PpBadge cur={r.pno} prev={r.prevPno} invertColors />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-slate-500">{fc(r.cpa)}</span>
                      {hasPrevData && <YoyBadge cur={r.cpa} prev={r.prevCpa} invertColors />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {showMargin ? (
                        <>
                          <span className={`font-semibold ${marzePct >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{formatPercent(marzePct)}</span>
                          {hasPrevData && prevMarzePct !== 0 && <PpBadge cur={marzePct} prev={prevMarzePct} />}
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {showMargin ? (
                        <>
                          <span className={`font-semibold ${grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fc(grossProfit)}</span>
                          {hasPrevData && prevGrossProfit !== 0 && <YoyBadge cur={grossProfit} prev={prevGrossProfit} />}
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      {showMargin ? (
                        <>
                          <span className={`font-semibold ${grossPct >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatPercent(grossPct)}</span>
                          {hasPrevData && prevGrossPct !== 0 && <PpBadge cur={grossPct} prev={prevGrossPct} />}
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
