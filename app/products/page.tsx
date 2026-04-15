'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown, ShoppingBag, Boxes, Package, ChevronUp, ChevronDown, Download, LayoutList, Search, X, LineChart as LineChartIcon } from 'lucide-react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import StatCard from '@/components/kpi/StatCard';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import { getDisplayCurrency } from '@/data/types';
import { mockData } from '@/data/mockGenerator';
import { productDataAT } from '@/data/productDataAT';
import { productDataCZ } from '@/data/productDataCZ';
import { productDataSK } from '@/data/productDataSK';
import { productDataPL } from '@/data/productDataPL';
import { productDataNL } from '@/data/productDataNL';
import { productDataDE } from '@/data/productDataDE';
import { formatCurrency, formatNumber, formatDate, localIsoDate, formatMonthYear } from '@/lib/formatters';

type SortKey = 'name' | 'amount' | 'revenue' | 'revenue_vat' | 'abc';
type SortDir = 'asc' | 'desc';
type AbcFilter = 'all' | 'A' | 'B' | 'C';

interface ProductRow {
  name: string;
  amount: number;
  revenue: number;
  revenue_vat: number;
  prevAmount: number;
  prevRevenue: number;
  abc: 'A' | 'B' | 'C';
  revenuePct: number;      // % podíl na celkovém obratu
  cumulativePct: number;   // kumulativní % (dle řazení revenue desc)
}

function yoyPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function YoyBadge({ current, prev }: { current: number; prev: number }) {
  const pct = yoyPct(current, prev);
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-lg ml-1.5 ${
      positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
    }`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function AbcBadge({ cat }: { cat: 'A' | 'B' | 'C' }) {
  const styles = {
    A: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    B: 'bg-amber-100 text-amber-700 border border-amber-200',
    C: 'bg-rose-100 text-rose-600 border border-rose-200',
  };
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold flex-shrink-0 ${styles[cat]}`}>
      {cat}
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp size={12} className="text-slate-300" />;
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-blue-500" />
    : <ChevronDown size={12} className="text-blue-500" />;
}

function aggregateByName(
  _countries: string[],
  startStr: string,
  endStr: string,
  _skMult?: number,
  productData = productDataAT,
): Record<string, { amount: number; revenue: number; revenue_vat: number }> {
  const byName: Record<string, { amount: number; revenue: number; revenue_vat: number }> = {};
  for (const r of productData) {
    if (r.date < startStr || r.date > endStr) continue;
    if (!byName[r.name]) byName[r.name] = { amount: 0, revenue: 0, revenue_vat: 0 };
    byName[r.name].amount      += r.amount;
    byName[r.name].revenue     += r.revenue;
    byName[r.name].revenue_vat += r.revenue_vat;
  }
  return byName;
}

// ─── Product Trend Chart ──────────────────────────────────────────────────────

const TREND_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0284c7',
];

function aggregateProductTrend(
  productNames: string[],
  _countries: string[],
  startStr: string,
  endStr: string,
  _skMult: number,
  isMonthly: boolean,
  productData = productDataAT,
): { key: string; [name: string]: number | string }[] {
  const buckets = new Map<string, Record<string, number>>();

  const initBucket = () => {
    const init: Record<string, number> = {};
    for (const n of productNames) { init[`${n}__rev`] = 0; init[`${n}__amt`] = 0; }
    return init;
  };

  const sources = productData;

  for (const r of sources) {
    if (r.date < startStr || r.date > endStr) continue;
    if (!productNames.includes(r.name)) continue;
    const key = isMonthly ? r.date.slice(0, 7) : r.date;
    if (!buckets.has(key)) buckets.set(key, initBucket());
    const b = buckets.get(key)!;
    b[`${r.name}__rev`] = (b[`${r.name}__rev`] ?? 0) + r.revenue;
    b[`${r.name}__amt`] = (b[`${r.name}__amt`] ?? 0) + r.amount;
  }

  // Fill missing daily keys with zeros
  if (!isMonthly) {
    const d = new Date(startStr);
    const endD = new Date(endStr);
    while (d <= endD) {
      const k = localIsoDate(d);
      if (!buckets.has(k)) buckets.set(k, initBucket());
      d.setDate(d.getDate() + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => ({ key, ...vals }));
}

interface ProductTrendChartProps {
  allProductNames: string[];
  countries: string[];
  startStr: string;
  endStr: string;
  skMult: number;
  currency: string;
  isMonthly: boolean;
  fc: (v: number) => string;
  productData?: typeof productDataAT;
}

function ProductTrendChart({
  allProductNames, countries, startStr, endStr, skMult, currency, isMonthly, fc, productData = productDataAT,
}: ProductTrendChartProps) {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return allProductNames.slice(0, 50);
    const q = query.toLowerCase();
    return allProductNames.filter(n => n.toLowerCase().includes(q)).slice(0, 50);
  }, [query, allProductNames]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addProduct = (name: string) => {
    if (!selectedProducts.includes(name)) {
      setSelectedProducts(p => [...p, name]);
    }
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeProduct = (name: string) => {
    setSelectedProducts(p => p.filter(n => n !== name));
  };

  const chartData = useMemo(() => {
    if (selectedProducts.length === 0) return [];
    return aggregateProductTrend(selectedProducts, countries, startStr, endStr, skMult, isMonthly, productData);
  }, [selectedProducts, countries, startStr, endStr, skMult, isMonthly]);

  const fmtKey = (key: string) => isMonthly
    ? formatMonthYear(key + '-01')
    : key.slice(5).replace('-', '.\u00a0');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    // Group by product name
    const byProduct: Record<string, { rev?: number; amt?: number; color: string }> = {};
    for (const entry of payload) {
      const key: string = entry.dataKey as string;
      const isRev = key.endsWith('__rev');
      const prodName = key.replace(/__rev$|__amt$/, '');
      if (!byProduct[prodName]) byProduct[prodName] = { color: entry.stroke };
      if (isRev) byProduct[prodName].rev = entry.value;
      else byProduct[prodName].amt = entry.value;
    }
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-md max-w-[260px]">
        <p className="font-semibold text-slate-600 mb-1.5">{label}</p>
        {Object.entries(byProduct).map(([name, vals]) => (
          <div key={name} className="mb-1 last:mb-0">
            <p style={{ color: vals.color }} className="font-medium truncate">{name.length > 35 ? name.slice(0, 35) + '…' : name}</p>
            <div className="flex gap-3 pl-0.5">
              {vals.rev !== undefined && (
                <span className="text-slate-600">Tržby: <span className="font-bold text-slate-800">{fc(vals.rev)}</span></span>
              )}
              {vals.amt !== undefined && (
                <span className="text-slate-600">Ks: <span className="font-bold text-slate-800">{Math.round(vals.amt)}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const fmtRevAxis = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k €` : `${Math.round(v)} €`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <LineChartIcon size={16} className="text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700">Vývoj prodejnosti — vybrané produkty</h2>
        <span className="text-xs text-slate-400 hidden sm:inline">plná čára = tržby bez DPH · čárkovaná = počet kusů</span>
      </div>

      {/* Search input + chips */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedProducts.map((name, idx) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: TREND_COLORS[idx % TREND_COLORS.length] }}
            >
              <span className="max-w-[180px] truncate">{name}</span>
              <button
                onClick={() => removeProduct(name)}
                className="ml-0.5 rounded-full hover:bg-white/20 p-0.5 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>

        <div className="relative">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Hledat produkt…"
              className="w-full sm:w-80 pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {open && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-20 mt-1 w-full sm:w-80 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
            >
              {suggestions.map(name => (
                <button
                  key={name}
                  onMouseDown={e => { e.preventDefault(); addProduct(name); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors truncate ${
                    selectedProducts.includes(name) ? 'text-slate-400 bg-slate-50' : 'text-slate-700'
                  }`}
                >
                  {selectedProducts.includes(name) ? '✓ ' : ''}{name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {selectedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
          <LineChartIcon size={32} className="opacity-30" />
          <p className="text-sm">Vyhledej a vyber produkt pro zobrazení vývoje tržeb a počtu kusů</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={fmtKey}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            {/* Left axis — revenue */}
            <YAxis
              yAxisId="rev"
              orientation="left"
              tickFormatter={fmtRevAxis}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            {/* Right axis — amount */}
            <YAxis
              yAxisId="amt"
              orientation="right"
              tickFormatter={v => String(Math.round(v))}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => {
                const isAmt = value.endsWith('__amt');
                const prodName = value.replace(/__rev$|__amt$/, '');
                const short = prodName.length > 30 ? prodName.slice(0, 30) + '…' : prodName;
                return (
                  <span className="text-xs text-slate-600">
                    {short} <span className="text-slate-400">{isAmt ? '(ks)' : '(tržby)'}</span>
                  </span>
                );
              }}
              wrapperStyle={{ paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            {selectedProducts.map((name, idx) => [
              <Line
                key={`${name}__rev`}
                yAxisId="rev"
                type="monotone"
                dataKey={`${name}__rev`}
                name={`${name}__rev`}
                stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />,
              <Line
                key={`${name}__amt`}
                yAxisId="amt"
                type="monotone"
                dataKey={`${name}__amt`}
                name={`${name}__amt`}
                stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
              />,
            ])}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const { filters } = useFilters();
  const { kpi, prevKpi, yoy, hasPrevData: hasPrevDataDash } = useDashboardData(filters, mockData);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [abcFilter, setAbcFilter] = useState<AbcFilter>('all');

  const { start, end, prevStart, prevEnd } = getDateRange(filters);
  const startStr     = localIsoDate(start);
  const endStr       = localIsoDate(end);
  const prevStartStr = localIsoDate(prevStart);
  const prevEndStr   = localIsoDate(prevEnd);

  const productByCountry = { at: productDataAT, cz: productDataCZ, sk: productDataSK, pl: productDataPL, nl: productDataNL, de: productDataDE };
  const productData = productByCountry[filters.countries[0]] ?? productDataAT;
  const currency = getDisplayCurrency(filters.countries);
  const fc = (v: number) => formatCurrency(v, currency);

  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const isMonthly = dayCount > 60;

  const skMult = 1;

  const { rows, hasPrevData, abcStats, prevTotalAmount } = useMemo(() => {
    const current = aggregateByName(filters.countries, startStr, endStr, undefined, productData);
    const prev    = aggregateByName(filters.countries, prevStartStr, prevEndStr, undefined, productData);

    const hasPrev = Object.values(prev).some(r => r.amount > 0);

    const allNames = new Set([...Object.keys(current), ...Object.keys(prev)]);
    const list: Omit<ProductRow, 'abc' | 'revenuePct' | 'cumulativePct'>[] = [];

    for (const name of allNames) {
      const c = current[name] ?? { amount: 0, revenue: 0, revenue_vat: 0 };
      const p = prev[name]    ?? { amount: 0, revenue: 0, revenue_vat: 0 };
      if (c.amount === 0 && c.revenue === 0) continue;
      list.push({
        name,
        amount:      c.amount,
        revenue:     c.revenue,
        revenue_vat: c.revenue_vat,
        prevAmount:  p.amount,
        prevRevenue: p.revenue,
      });
    }

    // ── ABC classification (always based on revenue desc) ──────────────────
    const totalRev = list.reduce((s, r) => s + r.revenue, 0);
    const sortedByRev = [...list].sort((a, b) => b.revenue - a.revenue);
    let cumRev = 0;
    const abcMap = new Map<string, { abc: 'A' | 'B' | 'C'; revenuePct: number; cumulativePct: number }>();
    for (const r of sortedByRev) {
      cumRev += r.revenue;
      const cumulativePct = totalRev > 0 ? (cumRev / totalRev) * 100 : 100;
      const revenuePct    = totalRev > 0 ? (r.revenue / totalRev) * 100 : 0;
      const abc: 'A' | 'B' | 'C' = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';
      abcMap.set(r.name, { abc, revenuePct, cumulativePct });
    }

    const fullList: ProductRow[] = list.map(r => ({
      ...r,
      abc:           abcMap.get(r.name)!.abc,
      revenuePct:    abcMap.get(r.name)!.revenuePct,
      cumulativePct: abcMap.get(r.name)!.cumulativePct,
    }));

    // ABC summary stats
    const abcStats = {
      A: { count: 0, revenue: 0 },
      B: { count: 0, revenue: 0 },
      C: { count: 0, revenue: 0 },
    };
    for (const r of fullList) {
      abcStats[r.abc].count++;
      abcStats[r.abc].revenue += r.revenue;
    }

    // Apply sort
    fullList.sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return mult * a.name.localeCompare(b.name, 'cs');
      if (sortKey === 'abc')  return mult * a.abc.localeCompare(b.abc);
      return mult * (a[sortKey] - b[sortKey]);
    });

    const prevTotalAmount = list.reduce((s, r) => s + r.prevAmount, 0);

    return { rows: fullList, hasPrevData: hasPrev, abcStats, prevTotalAmount };
  }, [filters.countries, startStr, endStr, prevStartStr, prevEndStr, sortKey, sortDir]);

  // All product names for autocomplete (sorted A-Z)
  const allProductNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of productData) names.add(r.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'cs'));
  }, []);

  // Apply ABC filter
  const filteredRows = abcFilter === 'all' ? rows : rows.filter(r => r.abc === abcFilter);

  const totalAmount     = rows.reduce((s, r) => s + r.amount, 0);
  const totalRevenue    = rows.reduce((s, r) => s + r.revenue, 0);
  const totalRevenueVat = rows.reduce((s, r) => s + r.revenue_vat, 0);
  const uniqueProducts  = rows.length;

  const avgItemsPerOrder = kpi.orders > 0 ? totalAmount / kpi.orders : 0;
  const prevAvgItems     = prevKpi.orders > 0 ? prevTotalAmount / prevKpi.orders : 0;
  const yoyAvgItems      = yoyPct(avgItemsPerOrder, prevAvgItems);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'abc' ? 'asc' : 'desc'); }
  };

  const exportCsv = () => {
    const header = ['ABC', 'Název produktu', 'Počet kusů', 'Počet kusů (loni)', `Bez DPH (EUR)`, `Bez DPH loni (EUR)`, `S DPH (EUR)`, 'Podíl na obratu (%)'];
    const csvRows = filteredRows.map(r => [
      r.abc,
      `"${r.name.replace(/"/g, '""')}"`,
      r.amount,
      r.prevAmount,
      r.revenue.toFixed(2),
      r.prevRevenue.toFixed(2),
      r.revenue_vat.toFixed(2),
      r.revenuePct.toFixed(2),
    ]);
    const content = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prodejnost_abc_${startStr}_${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;
  const thClass = () => `px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider cursor-pointer select-none hover:text-blue-200 transition-colors`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Prodejnost produktů</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* KPI boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        <StatCard title="Celkový prodej s DPH"  value={fc(totalRevenueVat)}        icon={<TrendingUp size={18} />} sub="EUR"              yoy={yoy.revenuevat}             hasPrevData={hasPrevDataDash} />
        <StatCard title="Celkový prodej bez DPH" value={fc(totalRevenue)}            icon={<ShoppingBag size={18} />} sub="EUR"             yoy={yoy.revenue}                hasPrevData={hasPrevDataDash} />
        <StatCard title="Celkový počet kusů"     value={formatNumber(totalAmount)}   icon={<Boxes size={18} />} sub="prodáno"                     yoy={yoyPct(totalAmount, prevTotalAmount)}  hasPrevData={hasPrevData} />
        <StatCard title="Počet produktů"          value={formatNumber(uniqueProducts)} icon={<Package size={18} />} sub="unikátních produktů" />
        <StatCard title="Produktů v objednávce"  value={avgItemsPerOrder.toFixed(2)} icon={<LayoutList size={18} />} sub="průměr ks / obj."    yoy={yoyAvgItems}                hasPrevData={hasPrevData} />
      </div>

      {/* ABC Summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-slate-700">ABC analýza produktů</h2>
          <span className="text-xs text-slate-400">— dle tržeb bez DPH</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* A */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">A</span>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Top produkty</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{abcStats.A.count}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{fc(abcStats.A.revenue)}</p>
            <p className="text-[11px] text-emerald-500 mt-1">
              {totalRevenue > 0 ? ((abcStats.A.revenue / totalRevenue) * 100).toFixed(1) : '0'}% obratu · zaměřit marketing
            </p>
          </div>
          {/* B */}
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-amber-500 text-white text-sm font-bold flex items-center justify-center">B</span>
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Potenciál</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{abcStats.B.count}</p>
            <p className="text-xs text-amber-600 mt-0.5">{fc(abcStats.B.revenue)}</p>
            <p className="text-[11px] text-amber-500 mt-1">
              {totalRevenue > 0 ? ((abcStats.B.revenue / totalRevenue) * 100).toFixed(1) : '0'}% obratu · rozvíjet
            </p>
          </div>
          {/* C */}
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-rose-500 text-white text-sm font-bold flex items-center justify-center">C</span>
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Výprodej</span>
            </div>
            <p className="text-2xl font-bold text-rose-700">{abcStats.C.count}</p>
            <p className="text-xs text-rose-600 mt-0.5">{fc(abcStats.C.revenue)}</p>
            <p className="text-[11px] text-rose-500 mt-1">
              {totalRevenue > 0 ? ((abcStats.C.revenue / totalRevenue) * 100).toFixed(1) : '0'}% obratu · kandidáti na výprodej
            </p>
          </div>
        </div>

        {/* Cumulative revenue bar */}
        <div className="mt-4">
          <div className="flex rounded-full overflow-hidden h-3">
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${totalRevenue > 0 ? (abcStats.A.revenue / totalRevenue) * 100 : 0}%` }}
            />
            <div
              className="bg-amber-400 transition-all"
              style={{ width: `${totalRevenue > 0 ? (abcStats.B.revenue / totalRevenue) * 100 : 0}%` }}
            />
            <div
              className="bg-rose-400 transition-all flex-1"
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
            <span>0%</span>
            <span className="text-emerald-600 font-medium">80% → A</span>
            <span className="text-amber-600 font-medium">95% → B</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Product trend chart */}
      <ProductTrendChart
        allProductNames={allProductNames}
        countries={filters.countries}
        startStr={startStr}
        endStr={endStr}
        skMult={skMult}
        currency={currency}
        isMonthly={isMonthly}
        fc={fc}
        productData={productData}
      />

      {/* Product table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Přehled produktů</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {formatNumber(filteredRows.length)} z {formatNumber(uniqueProducts)} produktů
              {hasPrevData && <span className="ml-1">· včetně YoY srovnání</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* ABC filter */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              {(['all', 'A', 'B', 'C'] as AbcFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setAbcFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    abcFilter === f
                      ? f === 'A' ? 'bg-emerald-600 text-white'
                        : f === 'B' ? 'bg-amber-500 text-white'
                        : f === 'C' ? 'bg-rose-500 text-white'
                        : 'bg-blue-800 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {f === 'all' ? 'Vše' : f}
                </button>
              ))}
            </div>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900 border-b border-blue-800">
                <th className={`${thClass()} text-center w-12`} onClick={() => handleSort('abc')}>
                  <span className="inline-flex items-center gap-1 justify-center w-full">
                    ABC <SortIcon col="abc" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
                <th className={`${thClass()} text-left`} onClick={() => handleSort('name')}>
                  <span className="inline-flex items-center gap-1">
                    Název produktu <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
                <th className={`${thClass()} text-right`} onClick={() => handleSort('amount')}>
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    Počet kusů <SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
                <th className={`${thClass()} text-right`} onClick={() => handleSort('revenue')}>
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    Bez DPH (€) <SortIcon col="revenue" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
                <th className={`${thClass()} text-right w-20`}>
                  Podíl
                </th>
                <th className={`${thClass()} text-right`} onClick={() => handleSort('revenue_vat')}>
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    S DPH (€) <SortIcon col="revenue_vat" sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => (
                <tr key={r.name} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-3 py-2.5 text-center">
                    <AbcBadge cat={r.abc} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{r.name}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="inline-block bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap">
                        {formatNumber(r.amount)}
                      </span>
                      {hasPrevData && <YoyBadge current={r.amount} prev={r.prevAmount} />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="whitespace-nowrap">{fc(r.revenue)}</span>
                      {hasPrevData && <YoyBadge current={r.revenue} prev={r.prevRevenue} />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-semibold text-slate-500">{r.revenuePct.toFixed(1)}%</span>
                      <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-1 rounded-full ${r.abc === 'A' ? 'bg-emerald-500' : r.abc === 'B' ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(100, r.revenuePct * 5)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fc(r.revenue_vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
                <td className="px-4 py-3" colSpan={2}>
                  <span className="text-blue-500 text-xs">Celkem ({abcFilter === 'all' ? 'vše' : `skupina ${abcFilter}`})</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-lg">
                    {formatNumber(filteredRows.reduce((s, r) => s + r.amount, 0))}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700 font-semibold">{fc(filteredRows.reduce((s, r) => s + r.revenue, 0))}</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-slate-500">
                  {totalRevenue > 0 ? ((filteredRows.reduce((s, r) => s + r.revenue, 0) / totalRevenue) * 100).toFixed(1) : '0'}%
                </td>
                <td className="px-4 py-3 text-right text-slate-500">{fc(filteredRows.reduce((s, r) => s + r.revenue_vat, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
