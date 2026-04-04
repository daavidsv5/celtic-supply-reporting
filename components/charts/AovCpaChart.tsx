'use client';

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartDataPoint } from '@/hooks/useDashboardData';
import { formatCurrency, formatShortDate } from '@/lib/formatters';
import { Currency } from '@/data/types';
import { C } from '@/lib/chartColors';

interface Props {
  data: ChartDataPoint[];
  currency?: Currency;
  hasPrevData?: boolean;
}

function formatYAxis(v: number, currency: Currency) {
  const suffix = currency === 'EUR' ? '€' : 'Kč';
  if (v >= 1_000) return `${Math.round(v / 1_000)}k\u00a0${suffix}`;
  return `${v}\u00a0${suffix}`;
}

function makeTooltip(currency: Currency, label1: string, label2: string, key1: string, key2: string) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[200px]">
        <p className="font-semibold text-slate-600 mb-2 pb-1.5 border-b border-slate-100">
          {formatShortDate(label)}
        </p>
        {payload.map((p: any) => (
          p.value != null && p.value > 0 && (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 flex-shrink-0 rounded" style={{ background: p.color }} />
                <span className="text-slate-500">{p.name}</span>
              </div>
              <span className="font-semibold text-slate-700">
                {formatCurrency(p.value, currency)}
              </span>
            </div>
          )
        ))}
      </div>
    );
  };
  CustomTooltip.displayName = `${key1}Tooltip`;
  return CustomTooltip;
}

function SingleLineChart({
  data, currency, hasPrevData, title, dataKey, prevKey, color, currentLabel, prevLabel,
}: {
  data: ChartDataPoint[];
  currency: Currency;
  hasPrevData: boolean;
  title: string;
  dataKey: keyof ChartDataPoint;
  prevKey: keyof ChartDataPoint;
  color: string;
  currentLabel: string;
  prevLabel: string;
}) {
  const CustomTooltip = makeTooltip(currency, currentLabel, prevLabel, dataKey as string, prevKey as string);
  const chartTitle = hasPrevData ? `${title} (YoY)` : title;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">{chartTitle}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatYAxis(v, currency)}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 16, color: '#64748b' }}
            iconType="plainline"
            iconSize={16}
          />
          <Line type="monotone" dataKey={dataKey as string} name={currentLabel} stroke={color} strokeWidth={2.5} dot={false} connectNulls />
          {hasPrevData && (
            <Line type="monotone" dataKey={prevKey as string} name={prevLabel} stroke={color} strokeWidth={1.5} dot={false} strokeDasharray="5 4" strokeOpacity={0.45} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AovChart({ data, currency = 'CZK', hasPrevData = true }: Props) {
  return (
    <SingleLineChart
      data={data}
      currency={currency}
      hasPrevData={hasPrevData}
      title="AOV – Průměrná hodnota objednávky"
      dataKey="aov"
      prevKey="aov_prev"
      color={C.aov}
      currentLabel="AOV (aktuální)"
      prevLabel="AOV (loňský rok)"
    />
  );
}

export function CpaChart({ data, currency = 'CZK', hasPrevData = true }: Props) {
  return (
    <SingleLineChart
      data={data}
      currency={currency}
      hasPrevData={hasPrevData}
      title="Cena za objednávku"
      dataKey="cpa"
      prevKey="cpa_prev"
      color={C.cost}
      currentLabel="CPA (aktuální)"
      prevLabel="CPA (loňský rok)"
    />
  );
}
