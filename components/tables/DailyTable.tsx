'use client';

import { useState } from 'react';
import { DailyRecord, Currency } from '@/data/types';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/formatters';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MarginRecord {
  date: string;
  purchaseCost: number;
}

interface Props {
  data: DailyRecord[];
  marginData?: MarginRecord[];
  currency?: Currency;
}

interface AggregatedRow {
  date: string;
  revenue_vat: number;
  revenue: number;
  orders: number;
  aov: number;
  cost: number;
  pno: number;
  cpa: number;
  purchaseCost: number;
  grossProfit: number;
  grossProfitPct: number;
}

function pnoBadge(pno: number) {
  if (pno === 0) return 'text-slate-400';
  if (pno < 15)  return 'bg-emerald-50 text-emerald-700';
  if (pno < 25)  return 'bg-amber-50 text-amber-700';
  if (pno < 35)  return 'bg-orange-50 text-orange-700';
  return 'bg-rose-50 text-rose-600';
}

const PAGE_SIZE = 20;

export default function DailyTable({ data, marginData, currency = 'EUR' }: Props) {
  const [page, setPage] = useState(0);

  const fc = (v: number) => formatCurrency(v, currency);
  const showMargin = !!marginData && marginData.length > 0;

  // Build margin lookup by date
  const marginByDate: Record<string, number> = {};
  if (marginData) {
    for (const m of marginData) {
      marginByDate[m.date] = (marginByDate[m.date] || 0) + m.purchaseCost;
    }
  }

  const byDate: Record<string, AggregatedRow> = {};
  for (const r of data) {
    if (!byDate[r.date]) {
      byDate[r.date] = { date: r.date, revenue_vat: 0, revenue: 0, orders: 0, aov: 0, cost: 0, pno: 0, cpa: 0, purchaseCost: 0, grossProfit: 0, grossProfitPct: 0 };
    }
    byDate[r.date].revenue_vat += r.revenue_vat;
    byDate[r.date].revenue     += r.revenue;
    byDate[r.date].orders      += r.orders;
    byDate[r.date].cost        += r.cost;
  }

  const rows: AggregatedRow[] = Object.values(byDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => {
      const purchaseCost  = marginByDate[r.date] ?? 0;
      const grossProfit   = r.revenue - purchaseCost - r.cost;
      const grossProfitPct = r.revenue > 0 ? (grossProfit / r.revenue) * 100 : 0;
      return {
        ...r,
        aov: r.orders > 0 ? r.revenue_vat / r.orders : 0,
        pno: r.revenue > 0 ? (r.cost / r.revenue) * 100 : 0,
        cpa: r.orders > 0 ? r.cost / r.orders : 0,
        purchaseCost,
        grossProfit,
        grossProfitPct,
      };
    });

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows   = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalRevVat      = rows.reduce((s, r) => s + r.revenue_vat, 0);
  const totalRev         = rows.reduce((s, r) => s + r.revenue, 0);
  const totalOrders      = rows.reduce((s, r) => s + r.orders, 0);
  const totalCost        = rows.reduce((s, r) => s + r.cost, 0);
  const totalPurchase    = rows.reduce((s, r) => s + r.purchaseCost, 0);
  const totalGrossProfit = totalRev - totalPurchase - totalCost;
  const totalGrossPct    = totalRev > 0 ? (totalGrossProfit / totalRev) * 100 : 0;
  const totalAov         = totalOrders > 0 ? totalRevVat / totalOrders : 0;
  const totalPno         = totalRev    > 0 ? (totalCost / totalRev) * 100 : 0;
  const totalCpa         = totalOrders > 0 ? totalCost / totalOrders : 0;

  const thClass = 'px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">Přehled po dnech</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-b border-blue-800">
              <th className={`${thClass} text-left w-10`}>#</th>
              <th className={`${thClass} text-left`}>Datum</th>
              <th className={`${thClass} text-right`}>Tržby s DPH</th>
              <th className={`${thClass} text-right`}>Tržby bez DPH</th>
              <th className={`${thClass} text-right`}>Objednávky</th>
              <th className={`${thClass} text-right`}>AOV</th>
              <th className={`${thClass} text-right`}>Náklady</th>
              <th className={`${thClass} text-right`}>PNO</th>
              <th className={`${thClass} text-right`}>CPA</th>
              {showMargin && <th className={`${thClass} text-right`}>Hrubý zisk</th>}
              {showMargin && <th className={`${thClass} text-right`}>Hrubý zisk %</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => {
              const globalIdx = page * PAGE_SIZE + idx + 1;
              return (
                <tr
                  key={r.date}
                  className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-300 text-xs tabular-nums">{globalIdx}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium whitespace-nowrap">
                    {formatDate(new Date(r.date + 'T12:00:00'))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                    {fc(r.revenue_vat)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-semibold tabular-nums">
                    {fc(r.revenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                    {formatNumber(r.orders)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                    {fc(r.aov)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-bold tabular-nums">
                    {fc(r.cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${pnoBadge(r.pno)}`}>
                      {formatPercent(r.pno)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                    {fc(r.cpa)}
                  </td>
                  {showMargin && (
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {fc(r.grossProfit)}
                    </td>
                  )}
                  {showMargin && (
                    <td className="px-4 py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${r.grossProfitPct >= 30 ? 'bg-emerald-50 text-emerald-700' : r.grossProfitPct >= 15 ? 'bg-amber-50 text-amber-700' : r.grossProfitPct >= 0 ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-600'}`}>
                        {formatPercent(r.grossProfitPct)}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
              <td className="px-4 py-3 text-xs text-blue-500" colSpan={2}>Celkem</td>
              <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fc(totalRevVat)}</td>
              <td className="px-4 py-3 text-right text-slate-700 font-semibold tabular-nums">{fc(totalRev)}</td>
              <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatNumber(totalOrders)}</td>
              <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fc(totalAov)}</td>
              <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{fc(totalCost)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${pnoBadge(totalPno)}`}>
                  {formatPercent(totalPno)}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fc(totalCpa)}</td>
              {showMargin && (
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${totalGrossProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {fc(totalGrossProfit)}
                </td>
              )}
              {showMargin && (
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${totalGrossPct >= 30 ? 'bg-emerald-50 text-emerald-700' : totalGrossPct >= 15 ? 'bg-amber-50 text-amber-700' : totalGrossPct >= 0 ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-600'}`}>
                    {formatPercent(totalGrossPct)}
                  </span>
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
        <p className="text-xs text-slate-400">
          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} z {rows.length} řádků
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-500"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs text-slate-500 px-2 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-500"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
