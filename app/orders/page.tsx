'use client';

import { useMemo } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import { mockData } from '@/data/mockGenerator';
import KpiCard from '@/components/kpi/KpiCard';
import { formatCurrency, formatNumber, formatPercent, formatDate, formatShortDate, localIsoDate } from '@/lib/formatters';
import { Wallet, Banknote, ShoppingCart, BarChart2, XCircle, AlertTriangle, Lightbulb, CalendarDays } from 'lucide-react';
import { orderValueDataAT } from '@/data/orderValueDataAT';
import { orderValueDataCZ } from '@/data/orderValueDataCZ';
import { orderValueDataSK } from '@/data/orderValueDataSK';
import { orderValueDataPL } from '@/data/orderValueDataPL';
import { orderValueDataNL } from '@/data/orderValueDataNL';
import { orderValueDataDE } from '@/data/orderValueDataDE';
import { C } from '@/lib/chartColors';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Cell,
} from 'recharts';

function formatYAxis(v: number, cur: 'CZK' | 'EUR' | 'PLN' = 'CZK') {
  const s = cur === 'EUR' ? '€' : cur === 'PLN' ? 'zł' : 'Kč';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ${s}`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k ${s}`;
  return `${v} ${s}`;
}

// Buckets for order value histogram
const CZK_BUCKETS = [
  { label: '0–500 Kč',       min: 0,    max: 500 },
  { label: '500–1 000 Kč',   min: 500,  max: 1000 },
  { label: '1 000–2 000 Kč', min: 1000, max: 2000 },
  { label: '2 000–5 000 Kč', min: 2000, max: 5000 },
  { label: '5 000+ Kč',      min: 5000, max: Infinity },
];
const EUR_BUCKETS = [
  { label: '0–20 €',    min: 0,   max: 20 },
  { label: '20–40 €',   min: 20,  max: 40 },
  { label: '40–80 €',   min: 40,  max: 80 },
  { label: '80–200 €',  min: 80,  max: 200 },
  { label: '200+ €',    min: 200, max: Infinity },
];

function buildHistogram(values: number[], buckets: typeof CZK_BUCKETS) {
  const total = values.length;
  return buckets.map(b => {
    const inBucket = values.filter(v => v >= b.min && v < b.max);
    const count = inBucket.length;
    const avg = count > 0 ? inBucket.reduce((s, v) => s + v, 0) / count : 0;
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      avg,
    };
  });
}

export default function OrdersPage() {
  const { filters } = useFilters();
  const { kpi, prevKpi, yoy, chartData, currentData, currency, hasPrevData } = useDashboardData(filters, mockData);

  const { start, end } = getDateRange(filters);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const dailyRevenue = chartData.map((d) => d.revenue);
  const dailyOrders = chartData.map((d) => d.orders);
  const dailyAov = chartData.map((d) => (d.orders > 0 ? d.revenue / d.orders : 0));

  const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const avgOrdersPerDay = kpi.orders / daysInPeriod;
  const prevAvgOrdersPerDay = hasPrevData && prevKpi ? prevKpi.orders / daysInPeriod : 0;
  const yoyAvgOrders = hasPrevData && prevAvgOrdersPerDay !== 0
    ? ((avgOrdersPerDay - prevAvgOrdersPerDay) / prevAvgOrdersPerDay) * 100
    : null;

  const fc = (v: number) => formatCurrency(v, currency);

  // ── Order value distribution ─────────────────────────────────────────────
  const orderValueByCountry = { at: orderValueDataAT, cz: orderValueDataCZ, sk: orderValueDataSK, pl: orderValueDataPL, nl: orderValueDataNL, de: orderValueDataDE };
  const orderValueData = orderValueByCountry[filters.countries[0]] ?? orderValueDataAT;
  const buckets = currency === 'CZK' ? CZK_BUCKETS : EUR_BUCKETS;

  const { histogram, hasOrderValueData } = useMemo(() => {
    const filtered: number[] = [];
    const startStr2 = localIsoDate(start);
    const endStr2   = localIsoDate(end);
    for (const r of orderValueData) {
      if (r.date >= startStr2 && r.date <= endStr2) filtered.push(r.value);
    }
    return {
      histogram: buildHistogram(filtered, buckets),
      hasOrderValueData: filtered.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderValueData, start, end]);

  const kpiCards = [
    { title: 'Tržby s DPH',     value: fc(kpi.revenuevat), yoy: yoy.revenuevat, sparklineData: dailyRevenue, icon: <Wallet size={16} /> },
    { title: 'Tržby bez DPH',   value: fc(kpi.revenue),    yoy: yoy.revenue,    sparklineData: dailyRevenue, icon: <Banknote size={16} /> },
    { title: 'Počet objednávek', value: formatNumber(kpi.orders), yoy: yoy.orders, sparklineData: dailyOrders, icon: <ShoppingCart size={16} /> },
    { title: 'AOV',              value: fc(kpi.aov),        yoy: yoy.aov,        sparklineData: dailyAov,     icon: <BarChart2 size={16} /> },
    { title: 'Ø objednávek / den', value: avgOrdersPerDay.toFixed(1), yoy: yoyAvgOrders, sparklineData: dailyOrders, icon: <CalendarDays size={16} /> },
    { title: 'Storna',           value: formatNumber(kpi.ordersCancelled), yoy: yoy.ordersCancelled, sparklineData: [], invertColors: true, icon: <XCircle size={16} /> },
    { title: 'Podíl storen',     value: formatPercent(kpi.cancelRate),     yoy: yoy.cancelRate,      sparklineData: [], invertColors: true, icon: <AlertTriangle size={16} /> },
  ].map(c => ({ ...c, hasPrevData }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Objednávky</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Tržby a objednávky</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => formatYAxis(v, currency)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={65}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={40}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) =>
                name === 'Objednávky' ? [value, name] : [fc(Number(value)), name]
              }
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="revenue" name="Tržby bez DPH" fill={C.primary} barSize={8} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              name="Objednávky"
              stroke={C.secondary}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Order value distribution */}
      {hasOrderValueData ? (() => {
        const peak = histogram.reduce((best, b) => b.count > best.count ? b : best, histogram[0]);
        const totalOrders = histogram.reduce((s, b) => s + b.count, 0);
        const allValues: number[] = [];
        // recompute sorted values for median
        const medianApprox = peak.avg;
        const sym = currency === 'EUR' ? '€' : currency === 'PLN' ? 'zł' : 'Kč';
        const threshold = peak.max === Infinity
          ? null
          : peak.max;
        return (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Distribuce hodnot objednávek</h2>
              <p className="text-xs text-slate-400 mt-0.5">Hodnota košíku bez DPH (bez dopravy a platby) — {formatNumber(totalOrders)} objednávek</p>
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={histogram} margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={v => `${v} %`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => {
                    if (name === 'pct') return [`${Number(value).toFixed(1)} %`, '% objednávek'];
                    return [value, name];
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
                        <p className="font-semibold text-slate-700 mb-1.5">{d.label}</p>
                        <div className="space-y-0.5">
                          <p className="text-slate-500">{formatNumber(d.count)} objednávek <span className="font-bold text-slate-700">({d.pct.toFixed(1)} %)</span></p>
                          <p className="text-slate-500">Průměr: <span className="font-bold text-slate-700">{fc(d.avg)}</span></p>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="pct" name="pct" radius={[4, 4, 0, 0]} maxBarSize={80}>
                  {histogram.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.label === peak.label ? C.primary : C.primaryLight}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {histogram.map((b) => (
                <div key={b.label} className={`rounded-xl p-3 border ${b.label === peak.label ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${b.label === peak.label ? 'text-blue-600' : 'text-slate-400'}`}>
                    {b.label}{b.label === peak.label && ' \u2605'}
                  </p>
                  <p className={`text-lg font-bold ${b.label === peak.label ? 'text-blue-700' : 'text-slate-700'}`}>
                    {b.pct.toFixed(1)} %
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatNumber(b.count)} obj. · ø {fc(b.avg)}
                  </p>
                </div>
              ))}
            </div>

            {/* Free shipping tip */}
            {threshold !== null && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <Lightbulb size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>
                  Nejčastější pásmo je <strong>{peak.label}</strong> ({peak.pct.toFixed(1)} % objednávek).
                  Zvažte nastavit <strong>dopravu zdarma od {threshold.toLocaleString('cs-CZ')} {sym}</strong> —
                  zákazníci těsně pod hranicí přidávají do košíku, aby ji dosáhli.
                </span>
              </div>
            )}
          </div>
        );
      })() : null}

    </div>
  );
}
