'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
  return `${v} ${suffix}`;
}

const makeTooltip = (currency: Currency) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[180px]">
        <p className="font-semibold text-slate-600 mb-2 pb-1.5 border-b border-slate-100">
          {formatShortDate(label)}
        </p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
              <span className="text-slate-500">{p.name}</span>
            </div>
            <span className="font-semibold text-slate-700">
              {p.name.includes('PNO') ? `${Number(p.value).toFixed(2)} %` : formatCurrency(p.value, currency)}
            </span>
          </div>
        ))}
      </div>
    );
  };
  CustomTooltip.displayName = 'CostTooltip';
  return CustomTooltip;
};

export default function CostPnoChart({ data, currency = 'EUR', hasPrevData = true }: Props) {
  const CustomTooltip = makeTooltip(currency);
  const title = hasPrevData ? 'Náklady a PNO (YoY)' : 'Náklady a PNO';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">{title}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
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
            yAxisId="left"
            tickFormatter={(v) => formatYAxis(v, currency)}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 16, color: '#64748b' }}
            iconType="square"
            iconSize={9}
          />
          <Bar yAxisId="left" dataKey="cost" name="Náklady (aktuální)" fill={C.cost} barSize={hasPrevData ? 5 : 8} radius={[3, 3, 0, 0]} />
          {hasPrevData && (
            <Bar yAxisId="left" dataKey="cost_prev" name="Náklady (loňský rok)" fill={C.costLight} barSize={5} radius={[3, 3, 0, 0]} />
          )}
          <Line yAxisId="right" type="monotone" dataKey="pno" name="PNO % (aktuální)" stroke={C.rate} strokeWidth={2.5} dot={false} />
          {hasPrevData && (
            <Line yAxisId="right" type="monotone" dataKey="pno_prev" name="PNO % (loňský rok)" stroke={C.rateLight} strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
