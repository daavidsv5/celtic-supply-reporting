'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown, Tag, ChevronRight, Search, X, LineChart as LineChartIcon } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { categoryDataAT } from '@/data/categoryDataAT';
import { categoryDataPL } from '@/data/categoryDataPL';
import { categoryDataNL } from '@/data/categoryDataNL';
import { categoryDataDE } from '@/data/categoryDataDE';
import { categoryDataSK } from '@/data/categoryDataSK';
import { categoryDataCZ } from '@/data/categoryDataCZ';
import { formatCurrency, formatNumber, localIsoDate, formatMonthYear } from '@/lib/formatters';
import { getDisplayCurrency, isAllCountries } from '@/data/types';
import { useExchangeRates, toCZK } from '@/hooks/useExchangeRates';
import { translateCategory, translateSubCategory } from '@/lib/categoryTranslations';

const HIDDEN_CATEGORIES = new Set(['Skrýt', 'Nach Hersteller', 'Nezařazeno']);

const TREND_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0284c7',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatOption {
  label: string;   // displayed in chip + legend
  root: string;
  sub: string;     // empty = root-level selection
}

interface SubRow {
  subCategory: string;
  revenue: number;
  prevRevenue: number;
  purchaseCost: number;
  prevPurchaseCost: number;
  quantity: number;
  prevQuantity: number;
  share: number;
}

interface CategoryRow {
  category: string;
  revenue: number;
  prevRevenue: number;
  purchaseCost: number;
  prevPurchaseCost: number;
  quantity: number;
  prevQuantity: number;
  share: number;
  subs: SubRow[];
}

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

function ShareBar({ pct, muted }: { pct: number; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all ${muted ? 'bg-slate-300' : 'bg-blue-400'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs w-10 text-right ${muted ? 'text-slate-400' : 'text-slate-500'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Trend chart aggregation ──────────────────────────────────────────────────

function aggregateCategoryTrend(
  selections: CatOption[],
  startStr: string,
  endStr: string,
  prevStartStr: string,
  prevEndStr: string,
  isMonthly: boolean,
  categoryData: { date: string; category: string; subCategory: string; revenue: number; purchaseCost: number }[],
): { key: string; [k: string]: number | string }[] {
  const offsetMs = new Date(startStr).getTime() - new Date(prevStartStr).getTime();

  const buckets = new Map<string, Record<string, number>>();

  const matchRecord = (r: { category: string; subCategory: string }, sel: CatOption) =>
    sel.sub === '' ? r.category === sel.root : r.category === sel.root && r.subCategory === sel.sub;

  for (const r of categoryData) {
    if (HIDDEN_CATEGORIES.has(r.category)) continue;

    // Current period
    if (r.date >= startStr && r.date <= endStr) {
      const key = isMonthly ? r.date.slice(0, 7) : r.date;
      if (!buckets.has(key)) buckets.set(key, {});
      const b = buckets.get(key)!;
      for (const sel of selections) {
        if (matchRecord(r, sel)) {
          b[`${sel.label}__cur`] = (b[`${sel.label}__cur`] ?? 0) + r.revenue;
        }
      }
    }

    // Previous period — shift date forward so it aligns on chart
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
      for (const sel of selections) {
        if (matchRecord(r, sel)) {
          b[`${sel.label}__prev`] = (b[`${sel.label}__prev`] ?? 0) + r.revenue;
        }
      }
    }
  }

  // Fill daily gaps
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

// ─── Trend Chart component ────────────────────────────────────────────────────

function CategoryTrendChart({
  allOptions, startStr, endStr, prevStartStr, prevEndStr, isMonthly, hasPrevData, fc, categoryData,
}: {
  allOptions: CatOption[];
  startStr: string; endStr: string;
  prevStartStr: string; prevEndStr: string;
  isMonthly: boolean;
  hasPrevData: boolean;
  fc: (v: number) => string;
  categoryData: { date: string; category: string; subCategory: string; revenue: number; purchaseCost: number }[];
}) {
  const [selected, setSelected] = useState<CatOption[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const opts = q
      ? allOptions.filter(o => o.label.toLowerCase().includes(q))
      : allOptions;
    return opts.slice(0, 60);
  }, [query, allOptions]);

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

  const addOption = (opt: CatOption) => {
    if (!selected.find(s => s.label === opt.label)) setSelected(p => [...p, opt]);
    setQuery(''); setOpen(false);
    inputRef.current?.focus();
  };
  const removeOption = (label: string) => setSelected(p => p.filter(s => s.label !== label));

  const chartData = useMemo(() => {
    if (selected.length === 0) return [];
    return aggregateCategoryTrend(selected, startStr, endStr, prevStartStr, prevEndStr, isMonthly, categoryData);
  }, [selected, startStr, endStr, prevStartStr, prevEndStr, isMonthly, categoryData]);

  const fmtKey = (key: string) => isMonthly
    ? formatMonthYear(key + '-01')
    : key.slice(5).replace('-', '.\u00a0');

  const currencySymbol = fc(0).replace(/[\d\s,.]/g, '').trim() || '€';
  const fmtAxis = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k ${currencySymbol}` : `${Math.round(v)} ${currencySymbol}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const byCat: Record<string, { cur?: number; prev?: number; color: string }> = {};
    for (const entry of payload) {
      const key: string = entry.dataKey;
      const isCur = key.endsWith('__cur');
      const catLabel = key.replace(/__cur$|__prev$/, '');
      if (!byCat[catLabel]) byCat[catLabel] = { color: entry.stroke };
      if (isCur) byCat[catLabel].cur = entry.value;
      else byCat[catLabel].prev = entry.value;
    }
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-md max-w-[280px]">
        <p className="font-semibold text-slate-600 mb-1.5">{isMonthly ? formatMonthYear(label + '-01') : label}</p>
        {Object.entries(byCat).map(([name, vals]) => (
          <div key={name} className="mb-1 last:mb-0">
            <p style={{ color: vals.color }} className="font-medium truncate">{name}</p>
            <div className="flex gap-3 pl-0.5">
              {vals.cur !== undefined && (
                <span className="text-slate-700">Akt.: <b>{fc(vals.cur)}</b></span>
              )}
              {vals.prev !== undefined && hasPrevData && (
                <span className="text-slate-400">Min.: <b>{fc(vals.prev)}</b></span>
              )}
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
        <h2 className="text-sm font-semibold text-slate-700">Vývoj tržeb — vybrané kategorie</h2>
        {hasPrevData && (
          <span className="text-xs text-slate-400 hidden sm:inline">plná čára = aktuální · čárkovaná = předchozí období</span>
        )}
      </div>

      {/* Chips + search */}
      <div className="mb-4">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selected.map((opt, idx) => (
              <span
                key={opt.label}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: TREND_COLORS[idx % TREND_COLORS.length] }}
              >
                <span className="max-w-[200px] truncate">{opt.label}</span>
                <button onClick={() => removeOption(opt.label)} className="ml-0.5 rounded-full hover:bg-white/20 p-0.5 transition-colors">
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
              placeholder="Hledat kategorii 1. nebo 2. řádu…"
              className="w-full sm:w-96 pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {open && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-20 mt-1 w-full sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto"
            >
              {suggestions.map(opt => {
                const isSelected = !!selected.find(s => s.label === opt.label);
                return (
                  <button
                    key={opt.label}
                    onMouseDown={e => { e.preventDefault(); if (!isSelected) addOption(opt); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                      isSelected ? 'text-slate-400 bg-slate-50 cursor-default' : 'text-slate-700'
                    }`}
                  >
                    {isSelected && <span className="text-blue-400">✓</span>}
                    {opt.sub ? (
                      <span>
                        <span className="text-slate-400 text-[10px]">{opt.root} ›</span>{' '}
                        <span className="font-medium">{opt.sub}</span>
                      </span>
                    ) : (
                      <span className="font-semibold">{opt.root}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {selected.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-44 text-slate-400 gap-2">
          <LineChartIcon size={32} className="opacity-30" />
          <p className="text-sm">Vyhledej a vyber kategorii pro zobrazení vývoje tržeb</p>
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
            {selected.map((opt, idx) => [
              <Line
                key={`${opt.label}__cur`}
                type="monotone"
                dataKey={`${opt.label}__cur`}
                name={`${opt.label}__cur`}
                stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />,
              ...(hasPrevData ? [
                <Line
                  key={`${opt.label}__prev`}
                  type="monotone"
                  dataKey={`${opt.label}__prev`}
                  name={`${opt.label}__prev`}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { filters } = useFilters();
  const { start, end, prevStart, prevEnd } = getDateRange(filters);
  const startStr     = localIsoDate(start);
  const endStr       = localIsoDate(end);
  const prevStartStr = localIsoDate(prevStart);
  const prevEndStr   = localIsoDate(prevEnd);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rates = useExchangeRates();
  const allCountries = isAllCountries(filters.countries);
  const currency = getDisplayCurrency(filters.countries);

  const activeCategoryData = useMemo(() => {
    if (allCountries) {
      const datasets: { data: typeof categoryDataCZ; cur: 'CZK' | 'EUR' | 'PLN' }[] = [
        { data: categoryDataCZ, cur: 'CZK' },
        { data: categoryDataSK, cur: 'EUR' },
        { data: categoryDataAT, cur: 'EUR' },
        { data: categoryDataNL, cur: 'EUR' },
        { data: categoryDataDE, cur: 'EUR' },
        { data: categoryDataPL, cur: 'PLN' },
      ];
      return datasets.flatMap(({ data, cur }) =>
        data.map(r => ({
          ...r,
          category: translateCategory(r.category),
          subCategory: r.subCategory ? translateSubCategory(r.subCategory) : '',
          revenue: toCZK(r.revenue, cur, rates),
          purchaseCost: toCZK(r.purchaseCost, cur, rates),
        }))
      );
    }
    const country = filters.countries[0];
    const raw = country === 'cz' ? categoryDataCZ
      : country === 'sk' ? categoryDataSK
      : country === 'pl' ? categoryDataPL
      : country === 'nl' ? categoryDataNL
      : country === 'de' ? categoryDataDE
      : categoryDataAT;
    return raw.map(r => ({
      ...r,
      category: translateCategory(r.category),
      subCategory: r.subCategory ? translateSubCategory(r.subCategory) : '',
    }));
  }, [allCountries, rates, filters.countries]);
  const fc = (v: number) => formatCurrency(v, currency);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const isMonthly = dayCount > 60;

  const toggleExpand = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const { rows, totalRevenue, prevTotalRevenue, totalPurchaseCost, prevTotalPurchaseCost, totalQuantity, prevTotalQuantity, hasPrevData, allOptions } = useMemo(() => {
    type Agg = { revenue: number; purchaseCost: number; quantity: number };
    const current: Record<string, Record<string, Agg>> = {};
    const prev:    Record<string, Record<string, Agg>> = {};

    for (const r of activeCategoryData) {
      if (HIDDEN_CATEGORIES.has(r.category)) continue;
      const sub = r.subCategory || '';
      if (r.date >= startStr && r.date <= endStr) {
        if (!current[r.category]) current[r.category] = {};
        if (!current[r.category][sub]) current[r.category][sub] = { revenue: 0, purchaseCost: 0, quantity: 0 };
        current[r.category][sub].revenue      += r.revenue;
        current[r.category][sub].purchaseCost += r.purchaseCost;
        current[r.category][sub].quantity     += (r as any).quantity ?? 0;
      }
      if (r.date >= prevStartStr && r.date <= prevEndStr) {
        if (!prev[r.category]) prev[r.category] = {};
        if (!prev[r.category][sub]) prev[r.category][sub] = { revenue: 0, purchaseCost: 0, quantity: 0 };
        prev[r.category][sub].revenue      += r.revenue;
        prev[r.category][sub].purchaseCost += r.purchaseCost;
        prev[r.category][sub].quantity     += (r as any).quantity ?? 0;
      }
    }

    const sumAgg = (subs: Record<string, Agg>) => Object.values(subs).reduce(
      (acc, v) => ({ revenue: acc.revenue + v.revenue, purchaseCost: acc.purchaseCost + v.purchaseCost, quantity: acc.quantity + v.quantity }),
      { revenue: 0, purchaseCost: 0, quantity: 0 }
    );

    const totalRev      = Object.values(current).reduce((s, subs) => s + sumAgg(subs).revenue, 0);
    const prevTotalRev  = Object.values(prev).reduce((s, subs) => s + sumAgg(subs).revenue, 0);
    const totalCost     = Object.values(current).reduce((s, subs) => s + sumAgg(subs).purchaseCost, 0);
    const prevTotalCost = Object.values(prev).reduce((s, subs) => s + sumAgg(subs).purchaseCost, 0);
    const totalQty      = Object.values(current).reduce((s, subs) => s + sumAgg(subs).quantity, 0);
    const prevTotalQty  = Object.values(prev).reduce((s, subs) => s + sumAgg(subs).quantity, 0);
    const hasPrev       = prevTotalRev > 0;

    const allRoots = new Set([...Object.keys(current), ...Object.keys(prev)]);
    const list: CategoryRow[] = [];
    const opts: CatOption[] = [];

    for (const cat of allRoots) {
      const curSubs  = current[cat] ?? {};
      const prevSubs = prev[cat]    ?? {};
      const curTot   = sumAgg(curSubs);
      const prevTot  = sumAgg(prevSubs);
      if (curTot.revenue === 0 && prevTot.revenue === 0) continue;

      opts.push({ label: cat, root: cat, sub: '' });

      const allSubs = new Set([...Object.keys(curSubs), ...Object.keys(prevSubs)]);
      const subRows: SubRow[] = [];
      for (const sub of allSubs) {
        if (!sub) continue;
        const s  = curSubs[sub]  ?? { revenue: 0, purchaseCost: 0, quantity: 0 };
        const p  = prevSubs[sub] ?? { revenue: 0, purchaseCost: 0, quantity: 0 };
        if (s.revenue === 0 && p.revenue === 0) continue;
        subRows.push({
          subCategory:      sub,
          revenue:          s.revenue,
          prevRevenue:      p.revenue,
          purchaseCost:     s.purchaseCost,
          prevPurchaseCost: p.purchaseCost,
          quantity:         s.quantity,
          prevQuantity:     p.quantity,
          share:            curTot.revenue > 0 ? (s.revenue / curTot.revenue) * 100 : 0,
        });
        opts.push({ label: `${cat} › ${sub}`, root: cat, sub });
      }
      subRows.sort((a, b) => b.revenue - a.revenue);

      list.push({
        category:         cat,
        revenue:          curTot.revenue,
        prevRevenue:      prevTot.revenue,
        purchaseCost:     curTot.purchaseCost,
        prevPurchaseCost: prevTot.purchaseCost,
        quantity:         curTot.quantity,
        prevQuantity:     prevTot.quantity,
        share:            totalRev > 0 ? (curTot.revenue / totalRev) * 100 : 0,
        subs:             subRows,
      });
    }

    list.sort((a, b) => b.revenue - a.revenue);
    // Sort options: roots first, then subs grouped under their root
    opts.sort((a, b) => {
      if (a.root !== b.root) return a.root.localeCompare(b.root);
      if (!a.sub) return -1;
      if (!b.sub) return 1;
      return a.sub.localeCompare(b.sub);
    });

    return { rows: list, totalRevenue: totalRev, prevTotalRevenue: prevTotalRev, totalPurchaseCost: totalCost, prevTotalPurchaseCost: prevTotalCost, totalQuantity: totalQty, prevTotalQuantity: prevTotalQty, hasPrevData: hasPrev, allOptions: opts };
  }, [startStr, endStr, prevStartStr, prevEndStr, activeCategoryData]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Tag size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Kategorie prodejnost</h1>
        </div>
      </div>

      {/* Trend chart */}
      <CategoryTrendChart
        allOptions={allOptions}
        startStr={startStr}
        endStr={endStr}
        prevStartStr={prevStartStr}
        prevEndStr={prevEndStr}
        isMonthly={isMonthly}
        hasPrevData={hasPrevData}
        fc={fc}
        categoryData={activeCategoryData}
      />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-900">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Kategorie</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Tržby bez DPH</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Marže (abs.)</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Marže %</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider">Počet ks</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white uppercase tracking-wider min-w-[140px]">Podíl (Tržby bez DPH)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expanded.has(row.category);
                const hasSubRows = row.subs.length > 0;
                return (
                  <>
                    <tr
                      key={row.category}
                      onClick={() => hasSubRows && toggleExpand(row.category)}
                      className={`border-t border-slate-50 transition-colors ${hasSubRows ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {hasSubRows ? (
                            <ChevronRight
                              size={15}
                              className={`text-blue-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          ) : (
                            <span className="w-[15px] flex-shrink-0" />
                          )}
                          <span className="font-semibold text-slate-800">{row.category}</span>
                          {hasSubRows && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                              {row.subs.length}
                            </span>
                          )}
                        </div>
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

                    {isExpanded && row.subs.map((sub) => (
                      <tr
                        key={`${row.category}|${sub.subCategory}`}
                        className="border-t border-slate-50 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-5 py-2.5 pl-12 text-slate-600">
                          <span className="text-xs text-slate-400 mr-2">└</span>
                          {sub.subCategory}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-700 font-medium tabular-nums">{fc(sub.revenue)}</span>
                            {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={sub.revenue} prev={sub.prevRevenue} /></span>}
                          </div>
                        </td>

                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-700 font-medium tabular-nums">{fc(sub.revenue - sub.purchaseCost)}</span>
                            {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={sub.revenue - sub.purchaseCost} prev={sub.prevRevenue - sub.prevPurchaseCost} /></span>}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <MarginBadge
                            revenue={sub.revenue} prevRevenue={sub.prevRevenue}
                            purchaseCost={sub.purchaseCost} prevPurchaseCost={sub.prevPurchaseCost}
                          />
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-600 tabular-nums">{formatNumber(sub.quantity)}</span>
                            {hasPrevData && <span className="w-[72px] shrink-0"><YoyBadge current={sub.quantity} prev={sub.prevQuantity} /></span>}
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <ShareBar pct={sub.share} muted />
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-3.5 pl-12 font-bold text-slate-700">Celkem</td>
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
            <Tag size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Žádná data pro vybrané období</p>
          </div>
        )}
      </div>
    </div>
  );
}
