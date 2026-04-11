'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartDataPoint } from '@/hooks/useDashboardData';
import { formatCurrency, formatShortDate, formatMonthYear } from '@/lib/formatters';
import { Currency } from '@/data/types';
import { C } from '@/lib/chartColors';

interface Props {
  data: ChartDataPoint[];
  currency?: Currency;
  hasPrevData?: boolean;
  isMonthly?: boolean;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(v: number, currency: Currency): string {
  return formatCurrency(v, currency);
}

function fmtMoneyAxis(v: number, currency: Currency): string {
  const suffix = currency === 'EUR' ? '€' : '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${suffix ? ' ' + suffix : ''}`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k${suffix ? ' ' + suffix : ''}`;
  return suffix ? `${Math.round(v)} ${suffix}` : String(Math.round(v));
}

// ─── Shared tooltip factory ───────────────────────────────────────────────────

function makeTooltip(
  currency: Currency,
  formatValue: (v: number) => string,
  tickFormatter: (date: string) => string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[170px]">
        <p className="font-semibold text-slate-600 mb-2 pb-1.5 border-b border-slate-100">
          {tickFormatter(label)}
        </p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
              <span className="text-slate-500">{p.name}</span>
            </div>
            <span className="font-semibold text-slate-700">{formatValue(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };
  void currency; // suppress unused warning
  CustomTooltip.displayName = 'KpiLineTooltip';
  return CustomTooltip;
}

// ─── Single chart card ────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  data: ChartDataPoint[];
  dataKey: keyof ChartDataPoint;
  prevKey: keyof ChartDataPoint;
  currentLabel: string;
  prevLabel: string;
  color: string;
  colorPrev: string;
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
  hasPrevData: boolean;
  tickFormatter: (date: string) => string;
  rightAxis?: boolean;
  rightColor?: string;
  rightColorPrev?: string;
  rightKey?: keyof ChartDataPoint;
  rightPrevKey?: keyof ChartDataPoint;
  rightLabel?: string;
  rightPrevLabel?: string;
  rightFormatAxis?: (v: number) => string;
  rightFormatValue?: (v: number) => string;
}

function ChartCard({
  title, data, dataKey, prevKey, currentLabel, prevLabel,
  color, colorPrev, formatValue, formatAxis, hasPrevData, tickFormatter,
}: ChartCardProps) {
  const CustomTooltip = makeTooltip('EUR', formatValue, tickFormatter);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatAxis}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14, color: '#64748b' }} iconType="circle" iconSize={8} />
          <Line
            type="monotone"
            dataKey={dataKey as string}
            name={currentLabel}
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          {hasPrevData && (
            <Line
              type="monotone"
              dataKey={prevKey as string}
              name={prevLabel}
              stroke={colorPrev}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PNO chart (% values) ─────────────────────────────────────────────────────

function PnoChartCard({ data, hasPrevData, tickFormatter }: {
  data: ChartDataPoint[];
  hasPrevData: boolean;
  tickFormatter: (date: string) => string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[170px]">
        <p className="font-semibold text-slate-600 mb-2 pb-1.5 border-b border-slate-100">{tickFormatter(label)}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
              <span className="text-slate-500">{p.name}</span>
            </div>
            <span className="font-semibold text-slate-700">{Number(p.value).toFixed(2)} %</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">{hasPrevData ? 'PNO % (YoY)' : 'PNO %'}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={v => `${v.toFixed(0)} %`}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14, color: '#64748b' }} iconType="circle" iconSize={8} />
          <Line type="monotone" dataKey="pno"      name="PNO % (aktuální)"    stroke={C.rate}      strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          {hasPrevData && (
            <Line type="monotone" dataKey="pno_prev" name="PNO % (loňský rok)" stroke={C.rateLight} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Export: 4-chart grid ─────────────────────────────────────────────────────

export default function KpiLineCharts({ data, currency = 'EUR', hasPrevData = true, isMonthly = false }: Props) {
  const tickFormatter = isMonthly
    ? (d: string) => formatMonthYear(d)
    : (d: string) => formatShortDate(d);

  const fc = (v: number) => fmtMoney(v, currency);
  const fa = (v: number) => fmtMoneyAxis(v, currency);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ChartCard
        title={hasPrevData ? 'Tržby bez DPH (YoY)' : 'Tržby bez DPH'}
        data={data}
        dataKey="revenue"
        prevKey="revenue_prev"
        currentLabel="Tržby (aktuální)"
        prevLabel="Tržby (loňský rok)"
        color={C.primary}
        colorPrev={C.primaryLight}
        formatValue={fc}
        formatAxis={fa}
        hasPrevData={hasPrevData}
        tickFormatter={tickFormatter}
      />
      <ChartCard
        title={hasPrevData ? 'Počet objednávek (YoY)' : 'Počet objednávek'}
        data={data}
        dataKey="orders"
        prevKey="orders_prev"
        currentLabel="Objednávky (aktuální)"
        prevLabel="Objednávky (loňský rok)"
        color={C.secondary}
        colorPrev={C.secondaryLight}
        formatValue={v => String(Math.round(v))}
        formatAxis={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))}
        hasPrevData={hasPrevData}
        tickFormatter={tickFormatter}
      />
      <ChartCard
        title={hasPrevData ? 'Náklady (YoY)' : 'Náklady'}
        data={data}
        dataKey="cost"
        prevKey="cost_prev"
        currentLabel="Náklady (aktuální)"
        prevLabel="Náklady (loňský rok)"
        color={C.cost}
        colorPrev={C.costLight}
        formatValue={fc}
        formatAxis={fa}
        hasPrevData={hasPrevData}
        tickFormatter={tickFormatter}
      />
      <PnoChartCard data={data} hasPrevData={hasPrevData} tickFormatter={tickFormatter} />
    </div>
  );
}
