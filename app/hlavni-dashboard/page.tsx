'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { mockData } from '@/data/mockGenerator';
import { marginDataAT } from '@/data/marginDataAT';
import { useHlavniDashboard } from '@/hooks/useHlavniDashboard';

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

// ─── Data aggregation ────────────────────────────────────────────────────────

interface MonthlyRow {
  revenue: number;
  orders: number;
  cost: number;
  purchaseCost: number;
  marginRev: number;
}

function aggregateMonthly(year: number): MonthlyRow[] {
  const months: MonthlyRow[] = Array.from({ length: 12 }, () => ({
    revenue: 0, orders: 0, cost: 0, purchaseCost: 0, marginRev: 0,
  }));

  for (const r of mockData) {
    const [y, m] = r.date.split('-').map(Number);
    if (y !== year) continue;
    const i = m - 1;
    months[i].revenue += r.revenue;
    months[i].orders  += r.orders;
    months[i].cost    += r.cost;
  }

  for (const r of marginDataAT) {
    const [y, m] = r.date.split('-').map(Number);
    if (y !== year) continue;
    months[m - 1].purchaseCost += r.purchaseCost;
    months[m - 1].marginRev    += r.revenue;
  }

  return months;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtCZK(v: number): string {
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0Kč`;
}

function fmtEUR(v: number): string {
  return `${v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0€`;
}

function fmtAxisCZK(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function fmtAxisEUR(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${Math.round(v)} €`;
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
  colorA: string;   // newer year — darker
  colorB: string;   // older year — lighter
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

  const monthsA = useMemo(() => aggregateMonthly(yearA), [yearA]);
  const monthsB = useMemo(() => aggregateMonthly(yearB), [yearB]);

  const chartData = useMemo(() => MONTHS_CS.map((month, i) => {
    const a = monthsA[i];
    const b = monthsB[i];
    return {
      month,
      revenue:     { a: a.revenue,                                                           b: b.revenue },
      grossProfit: { a: a.marginRev - a.purchaseCost - a.cost,                               b: b.marginRev - b.purchaseCost - b.cost },
      orders:      { a: a.orders,                                                             b: b.orders },
      cost:        { a: a.cost,                                                               b: b.cost },
      pno:         { a: a.revenue > 0 ? (a.cost / a.revenue) * 100 : 0,                     b: b.revenue > 0 ? (b.cost / b.revenue) * 100 : 0 },
      aov:         { a: a.orders > 0 ? a.revenue / a.orders : 0,                             b: b.orders > 0 ? b.revenue / b.orders : 0 },
      marginPct:   { a: a.marginRev > 0 ? ((a.marginRev - a.purchaseCost) / a.marginRev) * 100 : 0,
                     b: b.marginRev > 0 ? ((b.marginRev - b.purchaseCost) / b.marginRev) * 100 : 0 },
      cpa:         { a: a.orders > 0 ? a.cost / a.orders : 0,                               b: b.orders > 0 ? b.cost / b.orders : 0 },
    };
  }), [monthsA, monthsB]);

  function makeData(key: keyof typeof chartData[0]): { month: string; a: number; b: number }[] {
    return chartData.map(d => ({ month: d.month, ...(d[key] as { a: number; b: number }) }));
  }

  const pctFmt = (v: number) => `${v.toFixed(1).replace('.', ',')} %`;

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
          axisFormatter={fmtAxisEUR} tooltipFormatter={fmtEUR}
        />
        <ChartCard title="Hrubý zisk"
          data={makeData('grossProfit')}
          colorA="#16a34a" colorB="#86efac"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisEUR} tooltipFormatter={fmtEUR}
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
          axisFormatter={fmtAxisEUR} tooltipFormatter={fmtEUR}
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
          axisFormatter={fmtAxisEUR} tooltipFormatter={fmtEUR}
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
          axisFormatter={fmtAxisEUR} tooltipFormatter={fmtEUR}
        />
      </div>
    </div>
  );
}
