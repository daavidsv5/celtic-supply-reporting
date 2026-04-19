'use client';

import { useMemo } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { getDisplayCurrency } from '@/data/types';
import { useExchangeRates, toCZK } from '@/hooks/useExchangeRates';
import { marginDataAT } from '@/data/marginDataAT';
import { marginDataCZ } from '@/data/marginDataCZ';
import { marginDataSK } from '@/data/marginDataSK';
import { marginDataPL } from '@/data/marginDataPL';
import { marginDataNL } from '@/data/marginDataNL';
import { marginDataDE } from '@/data/marginDataDE';
import { realDataAT } from '@/data/realDataAT';
import { realDataCZ } from '@/data/realDataCZ';
import { realDataSK } from '@/data/realDataSK';
import { realDataPL } from '@/data/realDataPL';
import { realDataNL } from '@/data/realDataNL';
import { realDataDE } from '@/data/realDataDE';
import { formatCurrency, formatPercent, formatDate, formatNumber, formatShortDate, formatMonthYear, localIsoDate } from '@/lib/formatters';
import { Wallet, Banknote, ShoppingCart, TrendingUp, Percent, BarChart2, DollarSign } from 'lucide-react';
import StatCard from '@/components/kpi/StatCard';
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { C } from '@/lib/chartColors';

function fmtYAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
  return String(v);
}

function fmtPctAxis(v: number): string {
  return `${v.toFixed(0)} %`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarzeTooltip = ({ active, payload, label, currency, isMonthly }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-600 mb-2 pb-1.5 border-b border-slate-100">
        {isMonthly ? formatMonthYear(label) : formatShortDate(label)}
      </p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-700">
            {p.name.includes('%')
              ? formatPercent(p.value, 1)
              : formatCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function MarginPage() {
  const { filters } = useFilters();
  const rates = useExchangeRates();
  const { start, end, prevStart, prevEnd } = getDateRange(filters);

  const startStr     = localIsoDate(start);
  const endStr       = localIsoDate(end);
  const prevStartStr = localIsoDate(prevStart);
  const prevEndStr   = localIsoDate(prevEnd);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const marginByCountry  = { at: marginDataAT, cz: marginDataCZ, sk: marginDataSK, pl: marginDataPL, nl: marginDataNL, de: marginDataDE };
  const realByCountryMap = { at: realDataAT,   cz: realDataCZ,   sk: realDataSK,   pl: realDataPL,   nl: realDataNL,   de: realDataDE };
  const country = filters.countries[0] ?? 'at';
  const multiCountry = filters.countries.length > 1;
  const marginData = marginByCountry[country] ?? marginDataAT;
  const realData   = realByCountryMap[country]   ?? realDataAT;
  const currency = getDisplayCurrency(filters.countries);

  // All-country sources for multi-country aggregation
  const allMarginSources = [
    { data: marginDataAT, realSrc: realDataAT, cur: 'EUR' as const },
    { data: marginDataCZ, realSrc: realDataCZ, cur: 'CZK' as const },
    { data: marginDataSK, realSrc: realDataSK, cur: 'EUR' as const },
    { data: marginDataPL, realSrc: realDataPL, cur: 'PLN' as const },
    { data: marginDataNL, realSrc: realDataNL, cur: 'EUR' as const },
    { data: marginDataDE, realSrc: realDataDE, cur: 'EUR' as const },
  ];

  // Build index of realData by date (single or multi-country)
  const realByDate = useMemo(() => {
    const m: Record<string, { revenue_vat: number; revenue: number; orders: number; cost: number }> = {};
    const sources = multiCountry
      ? allMarginSources.map(s => ({ data: s.realSrc, cur: s.cur }))
      : [{ data: realData, cur: (currency === 'PLN' ? 'PLN' : currency === 'CZK' ? 'CZK' : 'EUR') as 'EUR' | 'CZK' | 'PLN' }];
    for (const { data, cur } of sources) {
      const factor = multiCountry ? toCZK(1, cur, rates) : 1;
      for (const r of data) {
        if (!m[r.date]) m[r.date] = { revenue_vat: 0, revenue: 0, orders: 0, cost: 0 };
        m[r.date].revenue_vat += r.revenue_vat * factor;
        m[r.date].revenue     += r.revenue     * factor;
        m[r.date].orders      += r.orders;
        m[r.date].cost        += r.cost        * factor;
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, multiCountry, rates]);

  type TotalsResult = {
    revVat: number; rev: number; orders: number; cost: number;
    purchaseCost: number; margin: number; marginPct: number;
    grossProfit: number; grossPct: number; pno: number;
  };
  type ChartRow = { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number };

  function computePeriod(s: string, e: string, rbd: typeof realByDate): { totals: TotalsResult; chartRows: ChartRow[]; isMonthly: boolean } {
    let revVat = 0, rev = 0, orders = 0, cost = 0, purchaseCost = 0, marginRev = 0;
    const dailyMap: Record<string, { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number; _marginRev: number }> = {};
    const datesInRange = new Set<string>();
    const mSources = multiCountry
      ? allMarginSources
      : [{ data: marginData, realSrc: realData, cur: (currency === 'PLN' ? 'PLN' : currency === 'CZK' ? 'CZK' : 'EUR') as 'EUR' | 'CZK' | 'PLN' }];
    for (const { data, cur } of mSources) {
      const factor = multiCountry ? toCZK(1, cur, rates) : 1;
      for (const r of data) {
        if (r.date < s || r.date > e) continue;
        datesInRange.add(r.date);
        const pc = r.purchaseCost * factor;
        const mr = r.revenue * factor;
        purchaseCost += pc;
        marginRev    += mr;
        const dayCost  = rbd[r.date]?.cost ?? 0;
        const dayMarze = mr - pc;
        const dayHZ    = dayMarze - dayCost;
        const prev = dailyMap[r.date];
        dailyMap[r.date] = {
          date: r.date, _marginRev: (prev?._marginRev ?? 0) + mr,
          marze: Math.round((prev?.marze ?? 0) + dayMarze),
          marzePct: 0,
          hrubyZisk: Math.round((prev?.hrubyZisk ?? 0) + dayHZ),
          hrubyZiskPct: 0,
        };
      }
    }
    for (const d of Object.keys(dailyMap)) {
      const v = dailyMap[d];
      v.marzePct     = v._marginRev > 0 ? (v.marze     / v._marginRev) * 100 : 0;
      v.hrubyZiskPct = v._marginRev > 0 ? (v.hrubyZisk / v._marginRev) * 100 : 0;
    }
    for (const [d, r] of Object.entries(rbd)) {
      if (d < s || d > e) continue;
      datesInRange.add(d);
      revVat += r.revenue_vat; rev += r.revenue; orders += r.orders; cost += r.cost;
    }
    const allDays  = [...datesInRange].sort();
    const dayCount = allDays.length;
    let chartRows: ChartRow[];
    if (dayCount > 60) {
      const byMonth: Record<string, { marze: number; marzePct_sum: number; hrubyZisk: number; hrubyZiskPct_sum: number; count: number }> = {};
      for (const [, v] of Object.entries(dailyMap)) {
        const key = v.date.substring(0, 7);
        if (!byMonth[key]) byMonth[key] = { marze: 0, marzePct_sum: 0, hrubyZisk: 0, hrubyZiskPct_sum: 0, count: 0 };
        byMonth[key].marze += v.marze; byMonth[key].marzePct_sum += v.marzePct;
        byMonth[key].hrubyZisk += v.hrubyZisk; byMonth[key].hrubyZiskPct_sum += v.hrubyZiskPct;
        byMonth[key].count++;
      }
      chartRows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({ date: key + '-01', marze: Math.round(v.marze), marzePct: v.count > 0 ? v.marzePct_sum / v.count : 0, hrubyZisk: Math.round(v.hrubyZisk), hrubyZiskPct: v.count > 0 ? v.hrubyZiskPct_sum / v.count : 0 }));
    } else {
      chartRows = allDays.map(d => {
        const v = dailyMap[d];
        return v ? { date: d, marze: v.marze, marzePct: v.marzePct, hrubyZisk: v.hrubyZisk, hrubyZiskPct: v.hrubyZiskPct }
                 : { date: d, marze: 0, marzePct: 0, hrubyZisk: 0, hrubyZiskPct: 0 };
      });
    }
    const margin      = marginRev - purchaseCost;
    const marginPct   = marginRev > 0 ? (margin / marginRev) * 100 : 0;
    const grossProfit = margin - cost;
    const grossPct    = marginRev > 0 ? (grossProfit / marginRev) * 100 : 0;
    const pno         = rev > 0 ? (cost / rev) * 100 : 0;
    return { totals: { revVat, rev, orders, cost, purchaseCost, margin, marginPct, grossProfit, grossPct, pno }, chartRows, isMonthly: dayCount > 60 };
  }

  const { totals, chartData, isMonthly, prevTotals, hasPrevData } = useMemo(() => {
    const cur  = computePeriod(startStr, endStr, realByDate);
    const prev = computePeriod(prevStartStr, prevEndStr, realByDate);

    // Merge prev year into chart rows by position
    const merged = cur.chartRows.map((row, i) => ({
      ...row,
      marze_prev:        prev.chartRows[i]?.marze        ?? null,
      marzePct_prev:     prev.chartRows[i]?.marzePct     ?? null,
      hrubyZisk_prev:    prev.chartRows[i]?.hrubyZisk    ?? null,
      hrubyZiskPct_prev: prev.chartRows[i]?.hrubyZiskPct ?? null,
    }));

    return {
      totals:      cur.totals,
      chartData:   merged,
      isMonthly:   cur.isMonthly,
      prevTotals:  prev.totals,
      hasPrevData: prev.totals.rev > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr, prevStartStr, prevEndStr, realByDate, multiCountry, rates]);

  const { revVat, rev, orders, cost, margin, marginPct, grossProfit, grossPct, pno } = totals;
  const dateTickFormatter = isMonthly ? formatMonthYear : formatShortDate;
  const currLabel = currency === 'CZK' ? 'Kč' : currency === 'PLN' ? 'zł' : '€';

  function yoy(cur: number, prev: number) { return prev > 0 ? ((cur - prev) / prev) * 100 : null; }

  const kpiCards = [
    { title: 'Tržby s DPH',           value: formatCurrency(revVat, currency), subtitle: `z objednávek ${multiCountry ? 'Vše (Kč)' : country.toUpperCase()}`,  icon: <Wallet size={18} />,    yoyVal: yoy(revVat, prevTotals.revVat) },
    { title: 'Tržby bez DPH',         value: formatCurrency(rev, currency),    subtitle: 'základ pro PNO a marži',               icon: <Banknote size={18} />,   yoyVal: yoy(rev, prevTotals.rev) },
    { title: 'Počet objednávek',       value: formatNumber(orders),             subtitle: 'dokončené objednávky',                 icon: <ShoppingCart size={18} />, yoyVal: yoy(orders, prevTotals.orders) },
    { title: 'Marketingové investice', value: formatCurrency(cost, currency),   subtitle: 'Google + Facebook',                   icon: <TrendingUp size={18} />,  yoyVal: yoy(cost, prevTotals.cost), invertYoy: true },
    { title: 'PNO (%)',                value: formatPercent(pno, 2),            subtitle: 'náklady / tržby bez DPH',              icon: <Percent size={18} />,     yoyVal: yoy(pno, prevTotals.pno), invertYoy: true },
    { title: 'Marže',                  value: formatCurrency(margin, currency), subtitle: 'tržby bez DPH − nákupní cena', negative: margin < 0,          icon: <BarChart2 size={18} />, yoyVal: yoy(margin, prevTotals.margin) },
    { title: 'Marže %',                value: formatPercent(marginPct, 1),      subtitle: 'marže / tržby bez DPH', negative: marginPct < 0,              icon: <Percent size={18} />,   yoyVal: yoy(marginPct, prevTotals.marginPct) },
    { title: 'Hrubý zisk',             value: formatCurrency(grossProfit, currency), subtitle: 'marže − marketingové investice', negative: grossProfit < 0, highlight: true, icon: <DollarSign size={18} />, yoyVal: yoy(grossProfit, prevTotals.grossProfit) },
    { title: 'Hrubý zisk %',           value: formatPercent(grossPct, 1),       subtitle: 'hrubý zisk / tržby bez DPH', negative: grossPct < 0, highlight: true, icon: <Percent size={18} />, yoyVal: yoy(grossPct, prevTotals.grossPct) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Maržový report</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>


      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpiCards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            sub={card.subtitle}
            negative={card.negative}
            highlight={card.highlight && !card.negative}
            yoy={card.yoyVal}
            hasPrevData={hasPrevData}
            invertYoy={card.invertYoy}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Marže + Marže % */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-5">Marže a Marže %</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dateTickFormatter}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tickFormatter={fmtYAxis}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtPctAxis}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<MarzeTooltip currency={currency} isMonthly={isMonthly} />} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16, color: '#64748b' }} iconType="square" iconSize={9} />
              <Bar yAxisId="left" dataKey="marze" name={`Marže (${currLabel})`} fill={C.margin} radius={[3, 3, 0, 0]} barSize={8} />
              {hasPrevData && <Bar yAxisId="left" dataKey="marze_prev" name={`Marže loni (${currLabel})`} fill={C.margin} fillOpacity={0.25} radius={[3, 3, 0, 0]} barSize={8} />}
              <Line yAxisId="right" type="monotone" dataKey="marzePct" name="Marže %" stroke={C.marginLight} strokeWidth={2} dot={false} />
              {hasPrevData && <Line yAxisId="right" type="monotone" dataKey="marzePct_prev" name="Marže % loni" stroke={C.marginLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Hrubý zisk + Hrubý zisk % */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-5">Hrubý zisk a Hrubý zisk %</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dateTickFormatter}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tickFormatter={fmtYAxis}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtPctAxis}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<MarzeTooltip currency={currency} isMonthly={isMonthly} />} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16, color: '#64748b' }} iconType="square" iconSize={9} />
              <Bar yAxisId="left" dataKey="hrubyZisk" name={`Hrubý zisk (${currLabel})`} fill={C.grossProfit} radius={[3, 3, 0, 0]} barSize={8} />
              {hasPrevData && <Bar yAxisId="left" dataKey="hrubyZisk_prev" name={`Hrubý zisk loni (${currLabel})`} fill={C.grossProfit} fillOpacity={0.25} radius={[3, 3, 0, 0]} barSize={8} />}
              <Line yAxisId="right" type="monotone" dataKey="hrubyZiskPct" name="Hrubý zisk %" stroke={C.grossProfitLight} strokeWidth={2} dot={false} />
              {hasPrevData && <Line yAxisId="right" type="monotone" dataKey="hrubyZiskPct_prev" name="Hrubý zisk % loni" stroke={C.grossProfitLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
