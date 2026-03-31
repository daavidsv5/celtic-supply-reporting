'use client';

import { useState, useMemo } from 'react';
import { Package, PackageCheck, PackageX, Layers, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { stockDataCZ } from '@/data/stockDataCZ';
import { stockDataSK } from '@/data/stockDataSK';
import { productDataCZ } from '@/data/productDataCZ';
import { productDataSK } from '@/data/productDataSK';
import { formatNumber } from '@/lib/formatters';
import StatCard from '@/components/kpi/StatCard';

type Tab = 'cz' | 'sk';
type SortKey = 'name' | 'code' | 'stock' | 'avgDaily' | 'daysLeft';
type SortDir = 'asc' | 'desc';

const DAYS_WINDOW = 30;

const LOW_STOCK_THRESHOLD = 10;

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Vyprodáno</span>;
  if (stock <= LOW_STOCK_THRESHOLD)
    return <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Málo</span>;
  return <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Skladem</span>;
}

function stockValueCls(stock: number): string {
  if (stock === 0) return 'text-rose-600';
  if (stock <= LOW_STOCK_THRESHOLD) return 'text-amber-600';
  return 'text-emerald-700';
}

export default function StockPage() {
  const [tab, setTab]         = useState<Tab>('cz');
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const data        = tab === 'cz' ? stockDataCZ : stockDataSK;
  const productData = tab === 'cz' ? productDataCZ : productDataSK;

  // Average daily sales per product (last DAYS_WINDOW days)
  const avgDailySales = useMemo(() => {
    const maxDate = productData.reduce((m, r) => r.date > m ? r.date : m, '');
    if (!maxDate) return {} as Record<string, number>;
    const cutoff = new Date(maxDate + 'T12:00:00');
    cutoff.setDate(cutoff.getDate() - DAYS_WINDOW);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const totals: Record<string, number> = {};
    for (const r of productData) {
      if (r.date >= cutoffStr && r.date <= maxDate)
        totals[r.name] = (totals[r.name] || 0) + r.amount;
    }
    const avg: Record<string, number> = {};
    for (const [name, total] of Object.entries(totals)) avg[name] = total / DAYS_WINDOW;
    return avg;
  }, [productData]);

  const kpis = useMemo(() => ({
    total:    data.length,
    inStock:  data.filter(r => r.stock > 0).length,
    outStock: data.filter(r => r.stock === 0).length,
    units:    data.reduce((s, r) => s + r.stock, 0),
  }), [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.code.includes(q))
      .sort((a, b) => {
        const avgA = avgDailySales[a.name] ?? 0;
        const avgB = avgDailySales[b.name] ?? 0;
        const daysA = avgA > 0 ? a.stock / avgA : Infinity;
        const daysB = avgB > 0 ? b.stock / avgB : Infinity;
        let cmp = 0;
        if (sortKey === 'name')     cmp = a.name.localeCompare(b.name, 'cs');
        if (sortKey === 'code')     cmp = a.code.localeCompare(b.code);
        if (sortKey === 'stock')    cmp = a.stock - b.stock;
        if (sortKey === 'avgDaily') cmp = avgA - avgB;
        if (sortKey === 'daysLeft') cmp = daysA - daysB;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [data, search, sortKey, sortDir, avgDailySales]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="opacity-100" />
      : <ChevronDown size={12} className="opacity-100" />;
  }

  const thBase = 'px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider cursor-pointer select-none hover:bg-blue-800 transition-colors';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stav skladu</h1>
          <p className="text-sm text-slate-500 mt-0.5">Aktuální stav zásob — data z Google Sheets</p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
          {(['cz', 'sk'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-slate-600'
              }`}
            >
              <span>{t === 'cz' ? '🇨🇿' : '🇸🇰'}</span> {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Celkem produktů" value={formatNumber(kpis.total)}   icon={<Package size={18} />} />
        <StatCard title="Skladem"         value={formatNumber(kpis.inStock)} icon={<PackageCheck size={18} />} highlight />
        <StatCard title="Vyprodáno"       value={formatNumber(kpis.outStock)}icon={<PackageX size={18} />} negative />
        <StatCard title="Celkem kusů"     value={formatNumber(kpis.units)}   icon={<Layers size={18} />} />
      </div>

      {/* Stock distribution bar */}
      <div className="bg-white rounded-xl border border-slate-100 px-5 py-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Dostupnost skladu</span>
          <span>
            <span className="text-emerald-600 font-semibold">{kpis.inStock} skladem</span>
            {' · '}
            <span className="text-rose-600 font-semibold">{kpis.outStock} vyprodáno</span>
            {' · '}
            {kpis.total > 0 ? ((kpis.inStock / kpis.total) * 100).toFixed(0) : 0} % dostupných
          </span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
          {kpis.total > 0 && (
            <>
              <div
                className="bg-emerald-400 transition-all"
                style={{ width: `${(data.filter(r => r.stock > LOW_STOCK_THRESHOLD).length / kpis.total) * 100}%` }}
                title="Dostatečné zásoby"
              />
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${(data.filter(r => r.stock > 0 && r.stock <= LOW_STOCK_THRESHOLD).length / kpis.total) * 100}%` }}
                title="Nízké zásoby (≤ 10 ks)"
              />
              <div
                className="bg-rose-400 transition-all"
                style={{ width: `${(kpis.outStock / kpis.total) * 100}%` }}
                title="Vyprodáno"
              />
            </>
          )}
        </div>
        <div className="flex gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" />Dostatečné ({'>'} {LOW_STOCK_THRESHOLD} ks)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />Nízké (1–{LOW_STOCK_THRESHOLD} ks)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-rose-400" />Vyprodáno</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-800 flex-1">Přehled produktů</h2>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Hledat..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900">
                <th className={`${thBase} text-left w-24`} onClick={() => toggleSort('code')}>
                  <span className="flex items-center gap-1">Kód <SortIcon col="code" /></span>
                </th>
                <th className={`${thBase} text-left sticky left-0 bg-blue-900 z-10`} onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">Název <SortIcon col="name" /></span>
                </th>
                <th className={`${thBase} text-right w-28`} onClick={() => toggleSort('stock')}>
                  <span className="flex items-center justify-end gap-1">Sklad (ks) <SortIcon col="stock" /></span>
                </th>
                <th className={`${thBase} text-right w-32`} onClick={() => toggleSort('avgDaily')}>
                  <span className="flex items-center justify-end gap-1">Prům. obrátka/den <SortIcon col="avgDaily" /></span>
                </th>
                <th className={`${thBase} text-right w-32`} onClick={() => toggleSort('daysLeft')}>
                  <span className="flex items-center justify-end gap-1">Dojde za <SortIcon col="daysLeft" /></span>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider text-center w-28">
                  Stav
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr
                  key={r.code}
                  className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                >
                  <td className="px-4 py-2.5 text-slate-400 font-mono text-xs whitespace-nowrap">{r.code}</td>
                  <td className="px-4 py-2.5 text-slate-800 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#f1f5f9]">{r.name}</td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${stockValueCls(r.stock)}`}>
                    {formatNumber(r.stock)}
                  </td>
                  {(() => {
                    const avg = avgDailySales[r.name] ?? 0;
                    const days = avg > 0 ? Math.round(r.stock / avg) : null;
                    const daysCls = days === null ? 'text-slate-300' : days <= 7 ? 'text-rose-600 font-bold' : days <= 30 ? 'text-amber-600 font-semibold' : 'text-emerald-600';
                    return (
                      <>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 text-xs">
                          {avg > 0 ? `${avg < 0.1 ? '< 0.1' : avg.toFixed(1)} ks` : <span className="text-slate-300">--</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums text-sm ${daysCls}`}>
                          {days === null ? <span className="text-slate-300 text-xs">--</span> : days === 0 ? <span className="text-rose-600 font-bold">dnes</span> : `${days} dní`}
                        </td>
                      </>
                    );
                  })()}
                  <td className="px-4 py-2.5 text-center">
                    <StockBadge stock={r.stock} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Žádné produkty nenalezeny</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
                <td className="px-4 py-3 text-blue-600 text-xs" colSpan={2}>
                  {filtered.length} z {kpis.total} produktů
                </td>
                <td className="px-4 py-3 text-right text-slate-800 tabular-nums">
                  {formatNumber(filtered.reduce((s, r) => s + r.stock, 0))} ks
                </td>
                <td /><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
