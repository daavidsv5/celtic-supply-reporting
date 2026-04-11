'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { mockData } from '@/data/mockGenerator';
import { formatCurrency, formatPercent, formatDate, localIsoDate } from '@/lib/formatters';
import { hourlyDataAT } from '@/data/hourlyDataAT';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { C } from '@/lib/chartColors';

const DAY_NAMES = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const DAY_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

function formatYAxis(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}

export default function BehaviorPage() {
  const { filters } = useFilters();
  const { start, end } = getDateRange(filters);

  const startStr = localIsoDate(start);
  const endStr   = localIsoDate(end);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const fc = (v: number) => formatCurrency(v, 'EUR');

  // Filter mockData by date range
  const filtered = useMemo(
    () => mockData.filter(r => r.date >= startStr && r.date <= endStr),
    [startStr, endStr]
  );

  // Aggregate by weekday
  const stats = useMemo(() => {
    const agg: Record<number, { orders: number; revenue: number; days: Set<string> }> = {};
    for (let d = 0; d < 7; d++) agg[d] = { orders: 0, revenue: 0, days: new Set() };

    for (const r of filtered) {
      const dow = new Date(r.date + 'T12:00:00').getDay();
      agg[dow].orders  += r.orders;
      agg[dow].revenue += r.revenue;
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
  }, [filtered]);

  const totalOrders  = stats.reduce((s, r) => s + r.orders,  0);
  const totalRevenue = stats.reduce((s, r) => s + r.revenue, 0);

  // ── Hourly data (all-time) — single avg line ────────────────────────────
  const hourlyChartData = useMemo(() => {
    const totRev  = new Array(24).fill(0);
    const totDays = new Array(24).fill(0);
    for (const p of hourlyDataAT) {
      totRev[p.hour]  += p.totalRevenue;
      totDays[p.hour] += p.dayCount;
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hour:    `${h}:00`,
      revenue: totDays[h] > 0 ? Math.round(totRev[h] / totDays[h]) : 0,
    }));
  }, []);

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
              <Bar dataKey="orders" name="Objednávky" fill={C.secondary} radius={[3, 3, 0, 0]} />
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
                tickFormatter={v => formatYAxis(v)}
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
              <Bar dataKey="revenue" name="Tržby bez DPH" fill={C.primary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly bar chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">
          Nákupy v průběhu dne{' '}
          <span className="text-xs font-normal text-slate-400">(průměr tržeb bez DPH / hodina)</span>
        </h2>
        <p className="text-[11px] text-slate-400 mb-4">Vychází ze všech dostupných dat — nezávisle na zvoleném období.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={hourlyChartData} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tickFormatter={v => formatYAxis(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={64} axisLine={false} tickLine={false} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [fc(Number(v)), 'Průměr tržeb bez DPH']}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Bar dataKey="revenue" name="Tržby bez DPH" fill={C.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
