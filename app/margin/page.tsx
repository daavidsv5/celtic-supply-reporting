'use client';

import { useMemo } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { marginDataAT } from '@/data/marginDataAT';
import { realDataAT } from '@/data/realDataAT';
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
  const { start, end } = getDateRange(filters);

  const startStr = localIsoDate(start);
  const endStr   = localIsoDate(end);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const currency = 'EUR' as const;

  // Build index of realDataAT by date
  const realATByDate = useMemo(() => {
    const m: Record<string, { revenue_vat: number; revenue: number; orders: number; cost: number }> = {};
    for (const r of realDataAT) {
      m[r.date] = { revenue_vat: r.revenue_vat, revenue: r.revenue, orders: r.orders, cost: r.cost };
    }
    return m;
  }, []);

  const { totals, chartData, isMonthly } = useMemo(() => {
    let revVat = 0, rev = 0, orders = 0, cost = 0, purchaseCost = 0, marginRev = 0;

    const dailyMap: Record<string, { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number }> = {};
    const datesInRange = new Set<string>();

    for (const r of marginDataAT) {
      if (r.date < startStr || r.date > endStr) continue;
      datesInRange.add(r.date);
      purchaseCost += r.purchaseCost;
      marginRev    += r.revenue;
      const dayReal  = realATByDate[r.date];
      const dayCost  = dayReal?.cost ?? 0;
      const dayMarze = r.revenue - r.purchaseCost;
      const dayHZ    = dayMarze - dayCost;
      const prev = dailyMap[r.date];
      dailyMap[r.date] = {
        date:         r.date,
        marze:        Math.round((prev?.marze ?? 0) + dayMarze),
        marzePct:     r.revenue > 0 ? (dayMarze / r.revenue) * 100 : 0,
        hrubyZisk:    Math.round((prev?.hrubyZisk ?? 0) + dayHZ),
        hrubyZiskPct: r.revenue > 0 ? (dayHZ / r.revenue) * 100 : 0,
      };
    }

    for (const [d, r] of Object.entries(realATByDate)) {
      if (d < startStr || d > endStr) continue;
      datesInRange.add(d);
      revVat  += r.revenue_vat;
      rev     += r.revenue;
      orders  += r.orders;
      cost    += r.cost;
    }

    // Group chart data by month if period > 60 days, else daily
    const allDays  = [...datesInRange].sort();
    const dayCount = allDays.length;
    let chartRows: { date: string; marze: number; marzePct: number; hrubyZisk: number; hrubyZiskPct: number }[];

    if (dayCount > 60) {
      const byMonth: Record<string, { marze: number; marzePct_sum: number; hrubyZisk: number; hrubyZiskPct_sum: number; count: number }> = {};
      for (const [, v] of Object.entries(dailyMap)) {
        const key = v.date.substring(0, 7);
        if (!byMonth[key]) byMonth[key] = { marze: 0, marzePct_sum: 0, hrubyZisk: 0, hrubyZiskPct_sum: 0, count: 0 };
        byMonth[key].marze            += v.marze;
        byMonth[key].marzePct_sum     += v.marzePct;
        byMonth[key].hrubyZisk        += v.hrubyZisk;
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
      chartRows = allDays.map(d => dailyMap[d] ?? { date: d, marze: 0, marzePct: 0, hrubyZisk: 0, hrubyZiskPct: 0 });
    }

    const margin      = marginRev - purchaseCost;
    const marginPct   = marginRev > 0 ? (margin / marginRev) * 100 : 0;
    const grossProfit = margin - cost;
    const grossPct    = marginRev > 0 ? (grossProfit / marginRev) * 100 : 0;
    const pno         = rev > 0 ? (cost / rev) * 100 : 0;

    return {
      totals: { revVat, rev, orders, cost, purchaseCost, margin, marginPct, grossProfit, grossPct, pno },
      chartData: chartRows,
      isMonthly: dayCount > 60,
    };
  }, [startStr, endStr, realATByDate]);

  const { revVat, rev, orders, cost, margin, marginPct, grossProfit, grossPct, pno } = totals;
  const dateTickFormatter = isMonthly ? formatMonthYear : formatShortDate;

  const currLabel = '€';

  const kpiCards = [
    { title: 'Tržby s DPH',           value: formatCurrency(revVat, currency), subtitle: 'z objednávek AT',                      icon: <Wallet size={18} /> },
    { title: 'Tržby bez DPH',         value: formatCurrency(rev, currency),    subtitle: 'základ pro PNO a marži',               icon: <Banknote size={18} /> },
    { title: 'Počet objednávek',       value: formatNumber(orders),             subtitle: 'dokončené objednávky',                 icon: <ShoppingCart size={18} /> },
    { title: 'Marketingové investice', value: formatCurrency(cost, currency),   subtitle: 'Google + Facebook', negative: false,  icon: <TrendingUp size={18} /> },
    { title: 'PNO (%)',                value: formatPercent(pno, 2),            subtitle: 'náklady / tržby bez DPH',              icon: <Percent size={18} /> },
    { title: 'Marže',                  value: formatCurrency(margin, currency), subtitle: 'tržby bez DPH − nákupní cena', negative: margin < 0,          icon: <BarChart2 size={18} /> },
    { title: 'Marže %',                value: formatPercent(marginPct, 1),      subtitle: 'marže / tržby bez DPH', negative: marginPct < 0,              icon: <Percent size={18} /> },
    { title: 'Hrubý zisk',             value: formatCurrency(grossProfit, currency), subtitle: 'marže − marketingové investice', negative: grossProfit < 0, highlight: true, icon: <DollarSign size={18} /> },
    { title: 'Hrubý zisk %',           value: formatPercent(grossPct, 1),       subtitle: 'hrubý zisk / tržby bez DPH', negative: grossPct < 0, highlight: true,             icon: <Percent size={18} /> },
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
