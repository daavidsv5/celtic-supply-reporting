'use client';

import { useMemo } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { marginDataCZ } from '@/data/marginDataCZ';
import { marginDataSK } from '@/data/marginDataSK';
import { realDataCZ } from '@/data/realDataCZ';
import { realDataSK } from '@/data/realDataSK';
import { formatCurrency, formatPercent, formatDate, formatNumber, formatShortDate, formatMonthYear } from '@/lib/formatters';
import { Info, Wallet, Banknote, ShoppingCart, TrendingUp, Percent, BarChart2, DollarSign } from 'lucide-react';
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
  const { filters, eurToCzk } = useFilters();
  const { start, end } = getDateRange(filters);

  const startStr = start.toISOString().split('T')[0];
  const endStr   = end.toISOString().split('T')[0];
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const isCZOnly  = filters.countries.length === 1 && filters.countries[0] === 'cz';
  const isSKOnly  = filters.countries.length === 1 && filters.countries[0] === 'sk';
  const isAll     = !isCZOnly && !isSKOnly;

  // SK values are in EUR; multiply by this to get the display currency
  const skMult = isSKOnly ? 1 : eurToCzk;
  const currency: 'CZK' | 'EUR' = isSKOnly ? 'EUR' : 'CZK';

  // Build index of realData by date
  const realCZByDate = useMemo(() => {
    const m: Record<string, { revenue_vat: number; revenue: number; orders: number; cost: number }> = {};
    for (const r of realDataCZ) {
      m[r.date] = { revenue_vat: r.revenue_vat, revenue: r.revenue, orders: r.orders, cost: r.cost };
    }
    return m;
  }, []);

  const realSKByDate = useMemo(() => {
    const m: Record<string, { revenue_vat: number; revenue: number; orders: number; cost: number }> = {};
    for (const r of realDataSK) {
      m[r.date] = { revenue_vat: r.revenue_vat, revenue: r.revenue, orders: r.orders, cost: r.cost };
    }
    return m;
  }, []);

  const { totals, chartData, skHasPurchaseCost, isMonthly } = useMemo(() => {
    let revVat = 0, rev = 0, orders = 0, cost = 0, purchaseCost = 0, marginRev = 0;
    let skHasPurchaseCost = false;

    // Pre-build margin data maps for fast lookup
    const marginCZMap: Record<string, number> = {};
    for (const r of marginDataCZ) marginCZMap[r.date] = r.revenue;
    const marginSKMap: Record<string, number> = {};
    for (const r of marginDataSK) marginSKMap[r.date] = r.revenue;

    const dailyMap: Record<string, { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number }> = {};
    const datesInRange = new Set<string>();

    // CZ data
    if (!isSKOnly) {
      for (const r of marginDataCZ) {
        if (r.date < startStr || r.date > endStr) continue;
        datesInRange.add(r.date);
        purchaseCost += r.purchaseCost;
        marginRev    += r.revenue;
        const dayReal = realCZByDate[r.date];
        const dayCost = dayReal?.cost ?? 0;
        const dayRev  = r.revenue;
        const dayMarze = dayRev - r.purchaseCost;
        const dayHZ    = dayMarze - dayCost;
        const prev = dailyMap[r.date];
        dailyMap[r.date] = {
          date:         r.date,
          marze:        Math.round((prev?.marze ?? 0) + dayMarze),
          marzePct:     0, // recalculated below
          hrubyZisk:    Math.round((prev?.hrubyZisk ?? 0) + dayHZ),
          hrubyZiskPct: 0,
        };
      }
      for (const [d, r] of Object.entries(realCZByDate)) {
        if (d < startStr || d > endStr) continue;
        datesInRange.add(d);
        revVat  += r.revenue_vat;
        rev     += r.revenue;
        orders  += r.orders;
        cost    += r.cost;
      }
    }

    // SK data
    if (!isCZOnly) {
      for (const r of marginDataSK) {
        if (r.date < startStr || r.date > endStr) continue;
        datesInRange.add(r.date);
        if (r.purchaseCost > 0) skHasPurchaseCost = true;
        purchaseCost += r.purchaseCost * skMult;
        marginRev    += r.revenue * skMult;
        const dayReal = realSKByDate[r.date];
        const dayCost = (dayReal?.cost ?? 0) * skMult;
        const dayRev  = r.revenue * skMult;
        const dayMarze = dayRev - r.purchaseCost * skMult;
        const dayHZ    = dayMarze - dayCost;
        const prev = dailyMap[r.date];
        dailyMap[r.date] = {
          date:         r.date,
          marze:        Math.round((prev?.marze ?? 0) + dayMarze),
          marzePct:     0,
          hrubyZisk:    Math.round((prev?.hrubyZisk ?? 0) + dayHZ),
          hrubyZiskPct: 0,
        };
      }
      for (const [d, r] of Object.entries(realSKByDate)) {
        if (d < startStr || d > endStr) continue;
        datesInRange.add(d);
        revVat  += r.revenue_vat * skMult;
        rev     += r.revenue * skMult;
        orders  += r.orders;
        cost    += r.cost * skMult;
      }
    }

    // Recalculate % for each day using combined revenue from margin data
    for (const [d, v] of Object.entries(dailyMap)) {
      let dayRev = 0;
      if (!isSKOnly && marginCZMap[d]) dayRev += marginCZMap[d];
      if (!isCZOnly && marginSKMap[d]) dayRev += marginSKMap[d] * skMult;
      v.marzePct     = dayRev > 0 ? (v.marze / dayRev) * 100 : 0;
      v.hrubyZiskPct = dayRev > 0 ? (v.hrubyZisk / dayRev) * 100 : 0;
    }

    // Group chart data by month if period > 60 days, else daily
    const allDays = [...datesInRange].sort();
    const dayCount = allDays.length;
    let chartRows: { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number }[];

    if (dayCount > 60) {
      const byMonth: Record<string, { marze: number; marzePct_sum: number; hrubyZisk: number; hrubyZiskPct_sum: number; count: number }> = {};
      for (const [d, v] of Object.entries(dailyMap)) {
        const key = d.substring(0, 7);
        if (!byMonth[key]) byMonth[key] = { marze: 0, marzePct_sum: 0, hrubyZisk: 0, hrubyZiskPct_sum: 0, count: 0 };
        byMonth[key].marze         += v.marze;
        byMonth[key].marzePct_sum  += v.marzePct;
        byMonth[key].hrubyZisk     += v.hrubyZisk;
        byMonth[key].hrubyZiskPct_sum += v.hrubyZiskPct;
        byMonth[key].count++;
      }
      chartRows = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          date:         key + '-01',
          marze:        Math.round(v.marze),
          marzePct:     v.count > 0 ? v.marzePct_sum / v.count : 0,
          hrubyZisk:    Math.round(v.hrubyZisk),
          hrubyZiskPct: v.count > 0 ? v.hrubyZiskPct_sum / v.count : 0,
        }));
    } else {
      chartRows = allDays
        .map(d => dailyMap[d] ?? { date: d, marze: 0, marzePct: 0, hrubyZisk: 0, hrubyZiskPct: 0 });
    }

    const margin      = marginRev - purchaseCost;
    const marginPct   = marginRev > 0 ? (margin / marginRev) * 100 : 0;
    const grossProfit = margin - cost;
    const grossPct    = marginRev > 0 ? (grossProfit / marginRev) * 100 : 0;
    const pno         = rev > 0 ? (cost / rev) * 100 : 0;

    return {
      totals: { revVat, rev, orders, cost, purchaseCost, margin, marginPct, grossProfit, grossPct, pno },
      chartData: chartRows,
      skHasPurchaseCost,
      isMonthly: dayCount > 60,
    };
  }, [startStr, endStr, realCZByDate, realSKByDate, isCZOnly, isSKOnly, skMult]);

  const { revVat, rev, orders, cost, margin, marginPct, grossProfit, grossPct, pno } = totals;
  const dateTickFormatter = isMonthly ? formatMonthYear : formatShortDate;

  const currLabel = currency === 'EUR' ? '€' : 'Kč';
  const marketLabel = isCZOnly ? 'CZ' : isSKOnly ? 'SK' : 'CZ + SK';

  const kpiCards = [
    { title: 'Tržby s DPH',           value: formatCurrency(revVat, currency), subtitle: `z objednávek ${marketLabel}`,          icon: <Wallet size={18} /> },
    { title: 'Tržby bez DPH',         value: formatCurrency(rev, currency),    subtitle: 'základ pro PNO a marži',               icon: <Banknote size={18} /> },
    { title: 'Počet objednávek',       value: formatNumber(orders),             subtitle: 'dokončené objednávky',                 icon: <ShoppingCart size={18} /> },
    { title: 'Marketingové investice', value: formatCurrency(cost, currency),   subtitle: 'Google + Facebook', negative: false,  icon: <TrendingUp size={18} /> },
    { title: 'PNO (%)',                value: formatPercent(pno, 2),            subtitle: 'náklady / tržby bez DPH',              icon: <Percent size={18} /> },
    { title: 'Marže',                  value: formatCurrency(margin, currency), subtitle: `tržby bez DPH − nákupní cena`, negative: margin < 0,         icon: <BarChart2 size={18} /> },
    { title: 'Marže %',                value: formatPercent(marginPct, 1),      subtitle: 'marže / tržby bez DPH', negative: marginPct < 0,             icon: <Percent size={18} /> },
    { title: 'Hrubý zisk',             value: formatCurrency(grossProfit, currency), subtitle: 'marže − marketingové investice', negative: grossProfit < 0, highlight: true, icon: <DollarSign size={18} /> },
    { title: 'Hrubý zisk %',           value: formatPercent(grossPct, 1),       subtitle: 'hrubý zisk / tržby bez DPH', negative: grossPct < 0, highlight: true,            icon: <Percent size={18} /> },
  ];

  const showSKNoPurchaseNote = !isCZOnly && !skHasPurchaseCost;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Maržový report</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* Info banners */}
      {isAll && (
        <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <Info size={16} className="flex-shrink-0 text-blue-500" />
          <span>
            Zobrazeny hodnoty pro <strong>CZ + SK</strong>. SK data jsou v EUR, přepočítána aktuálním kurzem{' '}
            <strong>1 EUR = {eurToCzk.toFixed(2)} Kč</strong>.
          </span>
        </div>
      )}
      {showSKNoPurchaseNote && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <Info size={16} className="flex-shrink-0 text-amber-500" />
          <span>
            SK nákupní ceny nejsou k dispozici pro vybrané období (data jsou dostupná od <strong>května 2025</strong>).
            Marže a hrubý zisk jsou proto nepřesné.
          </span>
        </div>
      )}

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
              <Line yAxisId="right" type="monotone" dataKey="marzePct" name="Marže %" stroke={C.marginLight} strokeWidth={2} dot={false} />
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
              <Line yAxisId="right" type="monotone" dataKey="hrubyZiskPct" name="Hrubý zisk %" stroke={C.grossProfitLight} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
