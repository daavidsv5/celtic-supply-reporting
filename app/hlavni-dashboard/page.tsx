'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { mockData } from '@/data/mockGenerator';
import { marginDataAT } from '@/data/marginDataAT';
import { marginDataCZ } from '@/data/marginDataCZ';
import { marginDataSK } from '@/data/marginDataSK';
import { marginDataPL } from '@/data/marginDataPL';
import { marginDataNL } from '@/data/marginDataNL';
import { marginDataDE } from '@/data/marginDataDE';
import { useHlavniDashboard } from '@/hooks/useHlavniDashboard';
import { useFilters } from '@/hooks/useFilters';
import { getDisplayCurrency } from '@/data/types';
import { useExchangeRates, toCZK, ExchangeRates } from '@/hooks/useExchangeRates';

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

const marginByCountry = {
  at: marginDataAT,
  cz: marginDataCZ,
  sk: marginDataSK,
  pl: marginDataPL,
  nl: marginDataNL,
  de: marginDataDE,
} as const;

// ─── Data aggregation ────────────────────────────────────────────────────────

interface MonthlyRow {
  revenue: number;
  orders: number;
  cost: number;
  purchaseCost: number;
  marginRev: number;
}

function aggregateMonthly(
  year: number,
  country: string,
  marginData: typeof marginDataAT,
): MonthlyRow[] {
  const months: MonthlyRow[] = Array.from({ length: 12 }, () => ({
    revenue: 0, orders: 0, cost: 0, purchaseCost: 0, marginRev: 0,
  }));

  for (const r of mockData) {
    if (r.country !== country) continue;
    const [y, m] = r.date.split('-').map(Number);
    if (y !== year) continue;
    const i = m - 1;
    months[i].revenue += r.revenue;
    months[i].orders  += r.orders;
    months[i].cost    += r.cost;
  }

  for (const r of marginData) {
    const [y, m] = r.date.split('-').map(Number);
    if (y !== year) continue;
    months[m - 1].purchaseCost += r.purchaseCost;
    months[m - 1].marginRev    += r.revenue;
  }

  return months;
}

const ALL_COUNTRY_SOURCES = [
  { country: 'at', marginData: marginDataAT, cur: 'EUR' as const },
  { country: 'cz', marginData: marginDataCZ, cur: 'CZK' as const },
  { country: 'sk', marginData: marginDataSK, cur: 'EUR' as const },
  { country: 'pl', marginData: marginDataPL, cur: 'PLN' as const },
  { country: 'nl', marginData: marginDataNL, cur: 'EUR' as const },
  { country: 'de', marginData: marginDataDE, cur: 'EUR' as const },
];

function aggregateMonthlyAll(year: number, rates: ExchangeRates): MonthlyRow[] {
  const months: MonthlyRow[] = Array.from({ length: 12 }, () => ({
    revenue: 0, orders: 0, cost: 0, purchaseCost: 0, marginRev: 0,
  }));

  for (const { country, marginData, cur } of ALL_COUNTRY_SOURCES) {
    const factor = toCZK(1, cur, rates);
    for (const r of mockData) {
      if (r.country !== country) continue;
      const [y, m] = r.date.split('-').map(Number);
      if (y !== year) continue;
      const i = m - 1;
      months[i].revenue += r.revenue * factor;
      months[i].orders  += r.orders;
      months[i].cost    += r.cost    * factor;
    }
    for (const r of marginData) {
      const [y, m] = r.date.split('-').map(Number);
      if (y !== year) continue;
      months[m - 1].purchaseCost += r.purchaseCost * factor;
      months[m - 1].marginRev    += r.revenue      * factor;
    }
  }

  return months;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function makeFmtValue(currency: 'EUR' | 'CZK' | 'PLN') {
  const sym = currency === 'EUR' ? '€' : currency === 'PLN' ? 'zł' : 'Kč';
  return (v: number): string =>
    `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0${sym}`;
}

function makeFmtAxis(currency: 'EUR' | 'CZK' | 'PLN') {
  const sym = currency === 'EUR' ? ' €' : currency === 'PLN' ? ' zł' : ' Kč';
  return (v: number): string => {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k${sym}`;
    return `${Math.round(v)}${sym}`;
  };
}

function fmtAxisPct(v: number): string {
  return `${v.toFixed(1).replace('.', ',')} %`;
}

function fmtAxisCount(v: number): string {
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

// ─── Chart component ─────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  data: { month: string; a: number; b: number }[];
  colorA: string;
  colorB: string;
  yearA: number;
  yearB: number;
  axisFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
}

function ChartCard({ title, data, colorA, colorB, yearA, yearB, axisFormatter, tooltipFormatter }: ChartCardProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-sm">
        <p className="font-medium text-slate-600 mb-1">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.fill }}>
            {entry.name}: <span className="font-semibold">{tooltipFormatter(entry.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={axisFormatter} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" iconSize={10} />
          <Bar dataKey="b" name={String(yearB)} fill={colorB} radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Bar dataKey="a" name={String(yearA)} fill={colorA} radius={[2, 2, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HlavniDashboardPage() {
  const { yearA, yearB } = useHlavniDashboard();
  const { filters } = useFilters();
  const rates = useExchangeRates();

  const country = filters.countries[0] ?? 'at';
  const multiCountry = filters.countries.length > 1;
  const currency = getDisplayCurrency(filters.countries);
  const marginData = marginByCountry[country as keyof typeof marginByCountry] ?? marginDataAT;

  const fmtValue = makeFmtValue(currency);
  const fmtAxis  = makeFmtAxis(currency);
  const pctFmt   = (v: number) => `${v.toFixed(1).replace('.', ',')} %`;

  const monthsA = useMemo(
    () => multiCountry ? aggregateMonthlyAll(yearA, rates) : aggregateMonthly(yearA, country, marginData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearA, country, marginData, multiCountry, rates],
  );
  const monthsB = useMemo(
    () => multiCountry ? aggregateMonthlyAll(yearB, rates) : aggregateMonthly(yearB, country, marginData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearB, country, marginData, multiCountry, rates],
  );

  const chartData = useMemo(() => MONTHS_CS.map((month, i) => {
    const a = monthsA[i];
    const b = monthsB[i];
    return {
      month,
      revenue:     { a: a.revenue,                                                                 b: b.revenue },
      grossProfit: { a: a.marginRev - a.purchaseCost - a.cost,                                     b: b.marginRev - b.purchaseCost - b.cost },
      orders:      { a: a.orders,                                                                   b: b.orders },
      cost:        { a: a.cost,                                                                     b: b.cost },
      pno:         { a: a.revenue > 0 ? (a.cost / a.revenue) * 100 : 0,                           b: b.revenue > 0 ? (b.cost / b.revenue) * 100 : 0 },
      aov:         { a: a.orders > 0 ? a.revenue / a.orders : 0,                                   b: b.orders > 0 ? b.revenue / b.orders : 0 },
      marginPct:   { a: a.marginRev > 0 ? ((a.marginRev - a.purchaseCost) / a.marginRev) * 100 : 0,
                     b: b.marginRev > 0 ? ((b.marginRev - b.purchaseCost) / b.marginRev) * 100 : 0 },
      cpa:         { a: a.orders > 0 ? a.cost / a.orders : 0,                                     b: b.orders > 0 ? b.cost / b.orders : 0 },
    };
  }), [monthsA, monthsB]);

  function makeData(key: keyof typeof chartData[0]): { month: string; a: number; b: number }[] {
    return chartData.map(d => ({ month: d.month, ...(d[key] as { a: number; b: number }) }));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Hlavní Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Měsíční přehled klíčových metrik · srovnání s předchozím rokem
        </p>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="Tržby bez DPH"
          data={makeData('revenue')}
          colorA="#2563eb" colorB="#93c5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxis} tooltipFormatter={fmtValue}
        />
        <ChartCard title="Hrubý zisk"
          data={makeData('grossProfit')}
          colorA="#16a34a" colorB="#86efac"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxis} tooltipFormatter={fmtValue}
        />
        <ChartCard title="Počet objednávek"
          data={makeData('orders')}
          colorA="#1e40af" colorB="#93c5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCount} tooltipFormatter={v => String(Math.round(v))}
        />
        <ChartCard title="Marketingové investice"
          data={makeData('cost')}
          colorA="#dc2626" colorB="#fca5a5"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxis} tooltipFormatter={fmtValue}
        />
        <ChartCard title="PNO (%)"
          data={makeData('pno')}
          colorA="#0891b2" colorB="#67e8f9"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisPct} tooltipFormatter={pctFmt}
        />
        <ChartCard title="AOV – Průměrná hodnota objednávky"
          data={makeData('aov')}
          colorA="#4338ca" colorB="#c4b5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxis} tooltipFormatter={fmtValue}
        />
        <ChartCard title="Marže (%)"
          data={makeData('marginPct')}
          colorA="#15803d" colorB="#86efac"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisPct} tooltipFormatter={pctFmt}
        />
        <ChartCard title="Cena za objednávku (CPA)"
          data={makeData('cpa')}
          colorA="#7c3aed" colorB="#c4b5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxis} tooltipFormatter={fmtValue}
        />
      </div>
    </div>
  );
}
