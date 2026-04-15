'use client';

import { useState, useMemo } from 'react';
import { ShoppingBag, Package, TrendingUp, Search } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { crossSellDataAT } from '@/data/crossSellDataAT';
import { crossSellDataCZ } from '@/data/crossSellDataCZ';
import { crossSellDataSK } from '@/data/crossSellDataSK';
import { crossSellDataPL } from '@/data/crossSellDataPL';
import { crossSellDataNL } from '@/data/crossSellDataNL';
import { crossSellDataDE } from '@/data/crossSellDataDE';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import StatCard from '@/components/kpi/StatCard';
import { C } from '@/lib/chartColors';

const COLORS = C.palette;

const crossSellByCountry = { at: crossSellDataAT, cz: crossSellDataCZ, sk: crossSellDataSK, pl: crossSellDataPL, nl: crossSellDataNL, de: crossSellDataDE };

export default function CrossSellPage() {
  const { filters } = useFilters();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const data = crossSellByCountry[filters.countries[0]] ?? crossSellDataAT;

  const multiPct = data.totalOrders > 0
    ? Math.round((data.multiItemOrders / data.totalOrders) * 100)
    : 0;

  const filteredPairs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.pairs;
    return data.pairs.filter(
      p => p.productA.toLowerCase().includes(q) || p.productB.toLowerCase().includes(q)
    );
  }, [data.pairs, search]);

  const totalPages = Math.ceil(filteredPairs.length / PAGE_SIZE);
  const visiblePairs = filteredPairs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const chartData = data.pairs.slice(0, 10).map((p, i) => ({
    name: `#${i + 1}`,
    label: `${p.productA.slice(0, 28)}… + ${p.productB.slice(0, 28)}…`,
    count: p.count,
    pct: p.pct,
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Cross-sell potenciál</h1>
        <p className="text-sm text-slate-500 mt-0.5">Produkty nejčastěji kupované společně v jedné objednávce</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        <StatCard
          title="Celkem objednávek"
          value={data.totalOrders.toLocaleString('cs-CZ')}
          icon={<ShoppingBag size={18} />}
        />
        <StatCard
          title="Objednávky s více produkty"
          value={`${multiPct} %`}
          sub={`${data.multiItemOrders.toLocaleString('cs-CZ')} objednávek`}
          icon={<Package size={18} />}
        />
        <StatCard
          title="Unikátních párů produktů"
          value={data.pairs.length.toLocaleString('cs-CZ')}
          sub="top 100 zobrazeno"
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Top 10 bar chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-5">Top 10 nejčastějších kombinací</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={28}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, _name: any, props: any) => [
                `${value} objednávek (${props.payload?.pct ?? 0} % z celku)`,
                props.payload?.label ?? '',
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Full pairs table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Všechny páry produktů
            {filteredPairs.length !== data.pairs.length && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({filteredPairs.length} výsledků)
              </span>
            )}
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Hledat produkt…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-left w-10">#</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-left">Produkt A</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-left">Produkt B</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-right">Objednávky</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-right">% z celku</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visiblePairs.map((pair, idx) => {
                const rank = page * PAGE_SIZE + idx + 1;
                const intensity = Math.max(0.08, Math.min(0.35, pair.pct / 25));
                return (
                  <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{rank}</td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `rgba(37,99,235,${intensity + 0.3})` }}
                        />
                        {pair.productA}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `rgba(79,70,229,${intensity + 0.3})` }}
                        />
                        {pair.productB}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-semibold text-slate-800">{pair.count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: `rgba(37,99,235,${intensity})`,
                          color: intensity > 0.2 ? '#1e3a8a' : '#3b82f6',
                        }}
                      >
                        {pair.pct.toFixed(1)} %
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visiblePairs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Žádné výsledky pro &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredPairs.length)} z {filteredPairs.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ←
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`px-2.5 py-1 rounded border transition-colors ${
                    i === page
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
