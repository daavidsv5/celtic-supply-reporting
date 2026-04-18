'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown, Award, Search, X, LineChart as LineChartIcon } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { brandDataAT } from '@/data/brandDataAT';
import { brandDataPL } from '@/data/brandDataPL';
import { brandDataNL } from '@/data/brandDataNL';
import { brandDataDE } from '@/data/brandDataDE';
import { brandDataSK } from '@/data/brandDataSK';
import { brandDataCZ } from '@/data/brandDataCZ';
import { formatCurrency, formatNumber, localIsoDate, formatMonthYear } from '@/lib/formatters';
import { getDisplayCurrency, isAllCountries } from '@/data/types';
import { useExchangeRates, toCZK } from '@/hooks/useExchangeRates';

const HIDDEN_BRANDS = new Set(['Nezařazeno']);

const TREND_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0284c7',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yoyPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function YoyBadge({ current, prev }: { current: number; prev: number }) {
  const pct = yoyPct(current, prev);
  if (pct === null) return <span className="text-xs text-slate-400 ml-1">—</span>;
  const positive = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-lg ml-1 ${
      positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
    }`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function marginPct(revenue: number, purchaseCost: number): number | null {
  if (revenue === 0) return null;
  return ((revenue - purchaseCost) / revenue) * 100;
}

function MarginBadge({ revenue, prevRevenue, purchaseCost, prevPurchaseCost }: {
  revenue: number; prevRevenue: number; purchaseCost: number; prevPurchaseCost: number;
}) {
  const cur  = marginPct(revenue, purchaseCost);
  const prev = marginPct(prevRevenue, prevPurchaseCost);
  if (cur === null) return <span className="text-slate-400">—</span>;
  const diff = prev !== null ? cur - prev : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold text-slate-800">{cur.toFixed(1)} %</span>
      {diff !== null && (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
          diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
        }`}>
          {diff >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {diff >= 0 ? '+' : ''}{diff.toFixed(1)} pp
        </span>
      )}
    </span>
  );
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div
          className="h-full rounded-full bg-blue-400 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right text-slate-500">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Trend chart aggregation ──────────────────────────────────────────────────

function aggregateBrandTrend(
  brands: string[],
  startStr: string,
  endStr: string,
  prevStartStr: string,
  prevEndStr: string,
  isMonthly: boolean,
  data: { date: string; brand: string; revenue: number; purchaseCost: number }[],
): { key: string; [k: string]: number | string }[] {
  const offsetMs = new Date(startStr).getTime() - new Date(prevStartStr).getTime();
  const buckets = new Map<string, Record<string, number>>();

  for (const r of data) {
    if (!brands.includes(r.brand)) continue;

    if (r.date >= startStr && r.date <= endStr) {
      const key = isMonthly ? r.date.slice(0, 7) : r.date;
      if (!buckets.has(key)) buckets.set(key, {});
      const b = buckets.get(key)!;
      b[`${r.brand}__cur`] = (b[`${r.brand}__cur`] ?? 0) + r.revenue;
    }

    if (r.date >= prevStartStr && r.date <= prevEndStr) {
      const shifted = isMonthly
        ? (() => {
            const d = new Date(r.date + 'T00:00:00');
            d.setFullYear(d.getFullYear() + (new Date(startStr).getFullYear() - new Date(prevStartStr).getFullYear()));
            return d.toISOString().slice(0, 7);
          })()
        : localIsoDate(new Date(new Date(r.date + 'T00:00:00').getTime() + offsetMs));
      if (!buckets.has(shifted)) buckets.set(shifted, {});
      const b = buckets.get(shifted)!;
      b[`${r.brand}__prev`] = (b[`${r.brand}__prev`] ?? 0) + r.revenue;
    }
  }

  if (!isMonthly) {
    const d = new Date(startStr + 'T00:00:00');
    const endD = new Date(endStr + 'T00:00:00');
    while (d <= endD) {
      const k = localIsoDate(d);
      if (!buckets.has(k)) buckets.set(k, {});
      d.setDate(d.getDate() + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => ({ key, ...vals }));
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

function BrandTrendChart({
  allBrands, startStr, endStr, prevStartStr, prevEndStr, isMonthly, hasPrevData, fc, brandData,
}: {
  allBrands: string[];
  startStr: string; endStr: string;
  prevStartStr: string; prevEndStr: string;
  isMonthly: boolean;
  hasPrevData: boolean;
  fc: (v: number) => string;
  brandData: { date: string; brand: string; revenue: number; purchaseCost: number }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const opts = q ? allBrands.filter(b => b.toLowerCase().includes(q)) : allBrands;
    return opts.slice(0, 60);
  }, [query, allBrands]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const add = (brand: string) => {
    if (!selected.includes(brand)) setSelected(p => [...p, brand]);
    setQuery(''); setOpen(false);
    inputRef.current?.focus();
  };
  const remove = (brand: string) => setSelected(p => p.filter(b => b !== brand));

  const chartData = useMemo(() => {
    if (selected.length === 0) return [];
    return aggregateBrandTrend(selected, startStr, endStr, prevStartStr, prevEndStr, isMonthly, brandData);
  }, [selected, startStr, endStr, prevStartStr, prevEndStr, isMonthly, brandData]);

  const fmtKey = (key: string) => isMonthly
    ? formatMonthYear(key + '-01')
    : key.slice(5).replace('-', '.\u00a0');

  const currencySymbol = fc(0).replace(/[\d\s,.]/g, '').trim() || '€';
  const fmtAxis = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k ${currencySymbol}` : `${Math.round(v)} ${currencySymbol}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const byBrand: Record<string, { cur?: number; prev?: number; color: string }> = {};
    for (const entry of payload) {
      const key: string = entry.dataKey;
      const isCur = key.endsWith('__cur');
      const name = key.replace(/__cur$|__prev$/, '');
      if (!byBrand[name]) byBrand[name] = { color: entry.stroke };
      if (isCur) byBrand[name].cur = entry.value;
      else byBrand[name].prev = entry.value;
    }
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-md max-w-[280px]">
        <p className="font-semibold text-slate-600 mb-1.5">{isMonthly ? formatMonthYear(label + '-01') : label}</p>
        {Object.entries(byBrand).map(([name, vals]) => (
          <div key={name} className="mb-1 last:mb-0">
            <p style={{ color: vals.color }} className="font-medium truncate">{name}</p>
            <div className="flex gap-3 pl-0.5">
              {vals.cur !== undefined && <span className="text-slate-700">Akt.: <b>{fc(vals.cur)}</b></span>}
              {vals.prev !== undefined && hasPrevData && <span className="text-slate-400">Min.: <b>{fc(vals.prev)}</b></span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <LineChartIcon size={16} className="text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700">Vývoj tržeb — vybrané značky</h2>
        {hasPrevData && (
          <span className="text-xs text-slate-400 hidden sm:inline">plná čára = aktuální · čárkovaná = předchozí období</span>
        )}
      </div>

      <div className="mb-4">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selected.map((brand, idx) => (
              <span
                key={brand}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: TREND_COLORS[idx % TREND_COLORS.length] }}
              >
                <span className="max-w-[200px] truncate">{brand}</span>
                <button onClick={() => remove(brand)} className="ml-0.5 rounded-full hover:bg-white/20 p-0.5 transition-colors">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Hledat značku…"
              className="w-full sm:w-96 pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {open && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-20 mt-1 w-full sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
            >
              {suggestions.map(brand => {
                const isSelected = selected.includes(brand);
                return (
                  <button
                    key={brand}
                    onMouseDown={e => { e.preventDefault(); if (!isSelected) add(brand); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                      isSelected ? 'text-slate-400 bg-slate-50 cursor-default' : 'text-slate-700'
                    }`}
                  >
                    {isSelected && <span className="text-blue-400">✓</span>}
                    <span className="font-medium">{brand}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-44 text-slate-400 gap-2">
          <LineChartIcon size={32} className="opacity-30" />
          <p className="text-sm">Vyhledej a vyber značku pro zobrazení vývoje tržeb</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={fmtKey}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={58}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => {
                const isCur = value.endsWith('__cur');
                const name = value.replace(/__cur$|__prev$/, '');
                const short = name.length > 32 ? name.slice(0, 32) + '…' : name;
                return (
                  <span className="text-xs text-slate-600">
                    {short}
                    {hasPrevData && <span className="text-slate-400"> ({isCur ? 'akt.' : 'min.'})</span>}
                  </span>
                );
              }}
              wrapperStyle={{ paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            {selected.map((brand, idx) => [
              <Line
                key={`${brand}__cur`}
                type="monotone"
                dataKey={`${brand}__cur`}
                name={`${brand}__cur`}
                stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />,
              ...(hasPrevData ? [
                <Line
                  key={`${brand}__prev`}
                  type="monotone"
                  dataKey={`${brand}__prev`}
                  name={`${brand}__prev`}
                  stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />,
              ] : []),
            ])}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandRow {
  brand: string;
  revenue: number;
  prevRevenue: number;
  purchaseCost: number;
  prevPurchaseCost: number;
  quantity: number;
  prevQuantity: number;
  share: number;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandsPage() {
  const { filters } = useFilters();
  const { start, end, prevStart, prevEnd } = getDateRange(filters);
  const startStr     = localIsoDate(start);
  const endStr       = localIsoDate(end);
  const prevStartStr = localIsoDate(prevStart);
  const prevEndStr   = localIsoDate(prevEnd);

  const rates = useExchangeRates();
  const allCountries = isAllCountries(filters.countries);
  const currency = getDisplayCurrency(filters.countries);

  const activeBrandData = useMemo(() => {
    if (allCountries) {
      const datasets: { data: typeof brandDataCZ; cur: 'CZK' | 'EUR' | 'PLN' }[] = [
        { data: brandDataCZ, cur: 'CZK' },
        { data: brandDataSK, cur: 'EUR' },
        { data: brandDataAT, cur: 'EUR' },
        { data: brandDataNL, cur: 'EUR' },
        { data: brandDataDE, cur: 'EUR' },
        { data: brandDataPL, cur: 'PLN' },
      ];
      return datasets.flatMap(({ data, cur }) =>
        data.map(r => ({
          ...r,
          revenue: toCZK(r.revenue, cur, rates),
          purchaseCost: toCZK(r.purchaseCost, cur, rates),
        }))
      );
    }
    const country = filters.countries[0];
    return country === 'cz' ? brandDataCZ
      : country === 'sk' ? brandDataSK
      : country === 'pl' ? brandDataPL
      : country === 'nl' ? brandDataNL
      : country === 'de' ? brandDataDE
      : brandDataAT;
  }, [allCountries, rates, filters.countries]);
  const fc = (v: number) => formatCurrency(v, currency);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const isMonthly = dayCount > 60;

  const { rows, totalRevenue, prevTotalRevenue, totalPurchaseCost, prevTotalPurchaseCost, totalQuantity, prevTotalQuantity, hasPrevData, allBrands } = useMemo(() => {
    const current: Record<string, { revenue: number; purchaseCost: number; quantity: number }> = {};
    const prev:    Record<string, { revenue: number; purchaseCost: number; quantity: number }> = {};

    for (const r of activeBrandData) {
      if (HIDDEN_BRANDS.has(r.brand)) continue;
      if (r.date >= startStr && r.date <= endStr) {
        if (!current[r.brand]) current[r.brand] = { revenue: 0, purchaseCost: 0, quantity: 0 };
        current[r.brand].revenue      += r.revenue;
        current[r.brand].purchaseCost += r.purchaseCost;
        current[r.brand].quantity     += (r as any).quantity ?? 0;
      }
      if (r.date >= prevStartStr && r.date <= prevEndStr) {
        if (!prev[r.brand]) prev[r.brand] = { revenue: 0, purchaseCost: 0, quantity: 0 };
        prev[r.brand].revenue      += r.revenue;
        prev[r.brand].purchaseCost += r.purchaseCost;
        prev[r.brand].quantity     += (r as any).quantity ?? 0;
      }
    }

    const totalRev      = Object.values(current).reduce((s, v) => s + v.revenue, 0);
    const prevTotalRev  = Object.values(prev).reduce((s, v) => s + v.revenue, 0);
    const totalCost     = Object.values(current).reduce((s, v) => s + v.purchaseCost, 0);
    const prevTotalCost = Object.values(prev).reduce((s, v) => s + v.purchaseCost, 0);
    const totalQty      = Object.values(current).reduce((s, v) => s + v.quantity, 0);
    const prevTotalQty  = Object.values(prev).reduce((s, v) => s + v.quantity, 0);
    const hasPrev       = prevTotalRev > 0;

    const allKeys = new Set([...Object.keys(current), ...Object.keys(prev)]);
    const list: BrandRow[] = [];
    const brands: string[] = [];

    for (const brand of allKeys) {
      const c = current[brand] ?? { revenue: 0, purchaseCost: 0, quantity: 0 };
      const p = prev[brand]    ?? { revenue: 0, purchaseCost: 0, quantity: 0 };
      if (c.revenue === 0 && p.revenue === 0) continue;
      list.push({
        brand,
        revenue:          c.revenue,
        prevRevenue:      p.revenue,
        purchaseCost:     c.purchaseCost,
        prevPurchaseCost: p.purchaseCost,
        quantity:         c.quantity,
        prevQuantity:     p.quantity,
        share:            totalRev > 0 ? (c.revenue / totalRev) * 100 : 0,
      });
      brands.push(brand);
    }

    list.sort((a, b) => b.revenue - a.revenue);
    brands.sort((a, b) => a.localeCompare(b));

    return {
      rows: list,
      totalRevenue: totalRev,
      prevTotalRevenue: prevTotalRev,
      totalPurchaseCost: totalCost,
      prevTotalPurchaseCost: prevTotalCost,
      totalQuantity: totalQty,
      prevTotalQuantity: prevTotalQty,
      hasPrevData: hasPrev,
      allBrands: brands,
    };
  }, [startStr, endStr, prevStartStr, prevEndStr, activeBrandData]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Award size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Značky prodejnost</h1>
          <p className="text-sm text-slate-500">Tržby bez DPH dle výrobce / značky · AT trh (EUR)</p>
        </div>
      </div>

      {/* Trend chart */}
      <BrandTrendChart
        allBrands={allBrands}
        startStr={startStr}
        endStr={endStr}
        prevStartStr={prevStartStr}
        prevEndStr={prevEndStr}
        isMonthly={isMonthly}
        hasPrevData={hasPrevData}
        fc={fc}
        brandData={activeBrandData}
      />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Značka</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Tržby bez DPH</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Marže (abs.)</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Marže %</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Počet ks</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider min-w-[140px]">Podíl (Tržby bez DPH)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.brand}
                  className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-800">{row.brand}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-semibold text-slate-800 tabular-nums">{fc(row.revenue)}</span>
                      {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={row.revenue} prev={row.prevRevenue} /></span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-semibold text-slate-800 tabular-nums">{fc(row.revenue - row.purchaseCost)}</span>
                      {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={row.revenue - row.purchaseCost} prev={row.prevRevenue - row.prevPurchaseCost} /></span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <MarginBadge
                      revenue={row.revenue} prevRevenue={row.prevRevenue}
                      purchaseCost={row.purchaseCost} prevPurchaseCost={row.prevPurchaseCost}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-semibold text-slate-800 tabular-nums">{formatNumber(row.quantity)}</span>
                      {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={row.quantity} prev={row.prevQuantity} /></span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <ShareBar pct={row.share} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-3.5 font-bold text-slate-700">Celkem</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold text-slate-800 tabular-nums">{fc(totalRevenue)}</span>
                    {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={totalRevenue} prev={prevTotalRevenue} /></span>}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold text-slate-800 tabular-nums">{fc(totalRevenue - totalPurchaseCost)}</span>
                    {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={totalRevenue - totalPurchaseCost} prev={prevTotalRevenue - prevTotalPurchaseCost} /></span>}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <MarginBadge
                    revenue={totalRevenue} prevRevenue={prevTotalRevenue}
                    purchaseCost={totalPurchaseCost} prevPurchaseCost={prevTotalPurchaseCost}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold text-slate-800 tabular-nums">{formatNumber(totalQuantity)}</span>
                    {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={totalQuantity} prev={prevTotalQuantity} /></span>}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-blue-200 rounded-full min-w-[60px]" />
                    <span className="text-xs font-bold text-slate-600 w-10 text-right">100%</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Award size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Žádná data pro vybrané období</p>
          </div>
        )}
      </div>
    </div>
  );
}
