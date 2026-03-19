'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { mockData } from '@/data/mockGenerator';
import { getDisplayCurrency, EUR_TO_CZK } from '@/data/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/formatters';
import { hourlyDataCZ } from '@/data/hourlyDataCZ';
import { hourlyDataSK } from '@/data/hourlyDataSK';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const DAY_NAMES = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const DAY_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun
const DOW_COLORS = ['#6366f1','#3b82f6','#0ea5e9','#14b8a6','#22c55e','#f59e0b','#ef4444'];
// Mon Tue Wed Thu Fri Sat Sun

function formatYAxis(v: number, cur: 'CZK' | 'EUR') {
  const s = cur === 'EUR' ? '€' : 'Kč';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ${s}`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k ${s}`;
  return `${v} ${s}`;
}

export default function BehaviorPage() {
  const { filters, eurToCzk } = useFilters();
  const { start, end } = getDateRange(filters);

  const startStr = start.toISOString().split('T')[0];
  const endStr   = end.toISOString().split('T')[0];
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const currency = getDisplayCurrency(filters.countries);
  const fc = (v: number) => formatCurrency(v, currency);
  const mult = (cur: 'CZK' | 'EUR') =>
    currency === 'CZK' && cur === 'EUR' ? (eurToCzk ?? EUR_TO_CZK) : 1;

  // Filter mockData by date range + selected countries
  const filtered = useMemo(
    () =>
      mockData.filter(
        r => r.date >= startStr && r.date <= endStr && filters.countries.includes(r.country)
      ),
    [startStr, endStr, filters.countries]
  );

  // Aggregate by weekday
  const stats = useMemo(() => {
    const agg: Record<number, { orders: number; revenue: number; days: Set<string> }> = {};
    for (let d = 0; d < 7; d++) agg[d] = { orders: 0, revenue: 0, days: new Set() };

    for (const r of filtered) {
      const dow = new Date(r.date + 'T12:00:00').getDay();
      const m   = mult(r.currency);
      agg[dow].orders  += r.orders;
      agg[dow].revenue += r.revenue * m;
      agg[dow].days.add(r.date);
    }

    return DAY_ORDER.map(d => ({
      dayIndex:   d,
      name:       DAY_NAMES[d],
      short:      DAY_SHORT[d],
      orders:     agg[d].orders,
      revenue:    agg[d].revenue,
      dayCount:   agg[d].days.size,
      avgOrders:  agg[d].days.size > 0 ? agg[d].orders  / agg[d].days.size : 0,
      avgRevenue: agg[d].days.size > 0 ? agg[d].revenue / agg[d].days.size : 0,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, currency, eurToCzk]);

  const totalOrders  = stats.reduce((s, r) => s + r.orders,  0);
  const totalRevenue = stats.reduce((s, r) => s + r.revenue, 0);

  // ── Hourly data (all-time, filtered by country) ───────────────────────────
  const hourlyGrid = useMemo(() => {
    const isCZOnly = filters.countries.length === 1 && filters.countries[0] === 'cz';
    const isSKOnly = filters.countries.length === 1 && filters.countries[0] === 'sk';
    const eur = eurToCzk ?? EUR_TO_CZK;

    // Build 7×24 grid with avgRevenue per cell
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

    if (isSKOnly) {
      for (const p of hourlyDataSK) grid[p.dayOfWeek][p.hour] = p.avgRevenue;
    } else if (isCZOnly) {
      for (const p of hourlyDataCZ) grid[p.dayOfWeek][p.hour] = p.avgRevenue;
    } else {
      // Vše: combine CZ (CZK) + SK converted to CZK, average by max dayCount
      const czMap  = new Map(hourlyDataCZ.map(p => [`${p.dayOfWeek}-${p.hour}`, p]));
      const skMap  = new Map(hourlyDataSK.map(p => [`${p.dayOfWeek}-${p.hour}`, p]));
      for (let dow = 0; dow < 7; dow++) {
        for (let h = 0; h < 24; h++) {
          const cz = czMap.get(`${dow}-${h}`);
          const sk = skMap.get(`${dow}-${h}`);
          const czRev = cz ? cz.totalRevenue : 0;
          const skRev = sk ? sk.totalRevenue * eur : 0;
          const days  = Math.max(cz?.dayCount ?? 0, sk?.dayCount ?? 0) || 1;
          grid[dow][h] = (czRev + skRev) / days;
        }
      }
    }
    return grid;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.countries, eurToCzk]);

  // Line chart data: 24 points, one per hour, one series per day of week (Mon→Sun)
  const hourlyChartData = useMemo(() =>
    Array.from({ length: 24 }, (_, h) => {
      const row: Record<string, number | string> = { hour: `${h}:00` };
      DAY_ORDER.forEach(dow => {
        row[DAY_SHORT[dow]] = Math.round(hourlyGrid[dow][h]);
      });
      return row;
    }),
  [hourlyGrid]);

  // Heatmap max for colour scaling
  const heatmapMax = useMemo(() => {
    let max = 0;
    for (const row of hourlyGrid) for (const v of row) if (v > max) max = v;
    return max || 1;
  }, [hourlyGrid]);

  const strongest = [...stats].sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  const weakest   = [...stats].sort((a, b) => a.avgRevenue - b.avgRevenue)[0];

  const chartData = stats.map(r => ({
    name:     r.short,
    fullName: r.name,
    orders:   Math.round(r.avgOrders  * 10) / 10,
    revenue:  Math.round(r.avgRevenue),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nákupní chování</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* KPI boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-800 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp size={22} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Nejsilnější den</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{strongest?.name ?? '—'}</p>
            <p className="text-sm text-emerald-600 font-medium mt-0.5">
              Ø {fc(strongest?.avgRevenue ?? 0)} tržeb bez DPH / den
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-800 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingDown size={22} className="text-rose-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Nejslabší den</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{weakest?.name ?? '—'}</p>
            <p className="text-sm text-rose-500 font-medium mt-0.5">
              Ø {fc(weakest?.avgRevenue ?? 0)} tržeb bez DPH / den
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Objednávky dle dne v týdnu{' '}
            <span className="text-xs font-normal text-slate-400">(průměr / den)</span>
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={35} axisLine={false} tickLine={false} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [`${Number(v).toFixed(1)} obj.`, 'Průměr objednávek']}
                labelFormatter={(l) => chartData.find(d => d.name === l)?.fullName ?? l}
              />
              <Bar dataKey="orders" name="Objednávky" fill="#166534" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Tržby dle dne v týdnu{' '}
            <span className="text-xs font-normal text-slate-400">(průměr bez DPH / den)</span>
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={v => formatYAxis(v, currency)}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={70}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [fc(Number(v)), 'Průměr tržeb bez DPH']}
                labelFormatter={(l) => chartData.find(d => d.name === l)?.fullName ?? l}
              />
              <Bar dataKey="revenue" name="Tržby bez DPH" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly line chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">
          Nákupy v průběhu dne{' '}
          <span className="text-xs font-normal text-slate-400">(průměr tržeb bez DPH / hodina, dle dne v týdnu)</span>
        </h2>
        <p className="text-[11px] text-slate-400 mb-4">Vychází ze všech dostupných dat — nezávisle na zvoleném období.</p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={hourlyChartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tickFormatter={v => formatYAxis(v, currency)}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              width={60}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => [fc(Number(v)), name]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} iconType="circle" iconSize={7} />
            {DAY_ORDER.map((dow, i) => (
              <Line
                key={dow}
                type="monotone"
                dataKey={DAY_SHORT[dow]}
                stroke={DOW_COLORS[i]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">
          Heatmapa nákupů — den × hodina
        </h2>
        <p className="text-[11px] text-slate-400 mb-4">Průměrné tržby bez DPH za hodinu. Tmavší = vyšší tržby.</p>
        <div className="overflow-x-auto">
          <table className="text-[10px] w-full border-collapse" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th className="pr-2 pb-1 text-left text-slate-400 font-medium w-8" />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="pb-1 text-center text-slate-400 font-normal w-7">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_ORDER.map((dow, rowIdx) => (
                <tr key={dow}>
                  <td className="pr-2 py-0.5 text-right text-slate-500 font-medium whitespace-nowrap">{DAY_SHORT[dow]}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const val = hourlyGrid[dow][h];
                    const ratio = heatmapMax > 0 ? val / heatmapMax : 0;
                    const alpha = ratio < 0.05 ? 0.04 : 0.12 + ratio * 0.82;
                    const textColor = ratio > 0.55 ? '#1e3a8a' : '#64748b';
                    return (
                      <td
                        key={h}
                        title={val > 0 ? fc(val) : '—'}
                        className="py-0.5 text-center rounded"
                        style={{
                          backgroundColor: `rgba(37,99,235,${alpha.toFixed(2)})`,
                          color: textColor,
                          width: 28,
                          height: 24,
                          cursor: 'default',
                        }}
                      >
                        {val >= heatmapMax * 0.35 ? (
                          <span className="font-semibold">{Math.round(val / 1000)}k</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Aktivita dle dne v týdnu</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900 border-b border-blue-800">
                <th className="px-4 py-3 text-left  text-[11px] font-semibold text-white uppercase tracking-wider">Den v týdnu</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Počet objednávek</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Ø obj. / den</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Podíl %</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Tržby bez DPH</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Ø tržby / den</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((r, idx) => {
                const share    = totalOrders > 0 ? (r.orders / totalOrders) * 100 : 0;
                const barWidth = totalOrders > 0
                  ? (r.orders / Math.max(...stats.map(s => s.orders))) * 100
                  : 0;
                return (
                  <tr
                    key={r.dayIndex}
                    className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-600">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.orders.toLocaleString('cs-CZ')}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{r.avgOrders.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="text-slate-600 tabular-nums w-12 text-right">
                          {formatPercent(share, 1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{fc(r.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{fc(r.avgRevenue)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
                <td className="px-4 py-3 text-blue-500 text-xs">Celkem</td>
                <td className="px-4 py-3 text-right text-slate-700">{totalOrders.toLocaleString('cs-CZ')}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {filtered.length > 0 ? (totalOrders / (new Set(filtered.map(r => r.date)).size || 1)).toFixed(1) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{formatPercent(100, 1)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{fc(totalRevenue)}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {filtered.length > 0 ? fc(totalRevenue / (new Set(filtered.map(r => r.date)).size || 1)) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
