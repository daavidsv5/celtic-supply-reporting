'use client';

import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import { mockData, getMarketingSourceData, getDailyMarketingData } from '@/data/mockGenerator';
import KpiCard from '@/components/kpi/KpiCard';
import CostPnoChart from '@/components/charts/CostPnoChart';
import { formatCurrency, formatPercent, formatNumber, formatDate, formatShortDate, localIsoDate } from '@/lib/formatters';
import { TrendingUp as TrendingUpIcon, TrendingUp, TrendingDown, Percent, Tag, Banknote, Share2, Search } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { C } from '@/lib/chartColors';

function yoyPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function YoyBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null || pct === 0) return null;
  const positive = invert ? pct < 0 : pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function pnoColor(pno: number): string {
  if (pno < 15) return 'bg-green-100 text-green-800';
  if (pno < 25) return 'bg-yellow-100 text-yellow-800';
  if (pno < 35) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}


export default function MarketingPage() {
  const { filters } = useFilters();
  const { kpi, yoy, chartData, currentData, currency, hasPrevData } = useDashboardData(filters, mockData);
  const fc = (v: number) => formatCurrency(v, currency);

  const { start, end } = getDateRange(filters);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const dailyCost = chartData.map((d) => d.cost);
  const dailyPno = chartData.map((d) => d.pno);
  const dailyCpa = chartData.map((d) => (d.orders > 0 ? d.cost / d.orders : 0));
  const dailyRevenue = chartData.map((d) => d.revenue);

  const kpiCards = [
    { title: 'Marketingové investice', value: fc(kpi.cost),    yoy: yoy.cost,    sparklineData: dailyCost,    invertColors: true, icon: <TrendingUpIcon size={16} /> },
    { title: 'PNO (%)',                value: formatPercent(kpi.pno), yoy: yoy.pno, sparklineData: dailyPno, invertColors: true, icon: <Percent size={16} /> },
    { title: 'Cena za objednávku',     value: fc(kpi.cpa),    yoy: yoy.cpa,     sparklineData: dailyCpa,     invertColors: true, icon: <Tag size={16} /> },
    { title: 'Tržby bez DPH',          value: fc(kpi.revenue),yoy: yoy.revenue, sparklineData: dailyRevenue, icon: <Banknote size={16} /> },
  ].map(c => ({ ...c, hasPrevData }));

  const sym = currency === 'EUR' ? '€' : 'Kč';

  // Daily marketing data — base for table + trend charts
  const { start: sDaily, end: eDaily } = getDateRange(filters);
  const allDailyMarketing = getDailyMarketingData(
    localIsoDate(sDaily),
    localIsoDate(eDaily),
    filters.countries,
  );

  const dailyRows = allDailyMarketing.slice(0, 30).map(r => ({
    ...r,
    pno: r.revenue > 0 ? (r.cost / r.revenue) * 100 : 0,
    cpa: r.orders > 0 ? r.cost / r.orders : 0,
    pno_fb: r.revenue > 0 ? (r.cost_facebook / r.revenue) * 100 : 0,
    pno_g:  r.revenue > 0 ? (r.cost_google   / r.revenue) * 100 : 0,
  }));

  // Ascending for trend charts
  const marketingChartData = [...allDailyMarketing].reverse().map(r => ({
    date: r.date,
    clicks_fb: r.clicks_facebook,
    clicks_g:  r.clicks_google,
    cpc_fb: r.clicks_facebook > 0 ? Math.round(r.cost_facebook / r.clicks_facebook * 100) / 100 : null,
    cpc_g:  r.clicks_google   > 0 ? Math.round(r.cost_google   / r.clicks_google   * 100) / 100 : null,
  }));

  // Source breakdown — use real data with date range + country context
  const sourceData = getMarketingSourceData(
    localIsoDate(sDaily),
    localIsoDate(eDaily),
    filters.countries,
  );

  // Per-channel summary metrics
  const fb = sourceData.find(s => s.source === 'Facebook Ads') ?? { cost: 0, clicks: 0, revenue: 0, cpa: 0, orders: 0, pno: 0 };
  const gg = sourceData.find(s => s.source === 'Google Ads')   ?? { cost: 0, clicks: 0, revenue: 0, cpa: 0, orders: 0, pno: 0 };
  const fbCpc  = fb.clicks > 0 ? fb.cost / fb.clicks : 0;
  const gCpc   = gg.clicks > 0 ? gg.cost / gg.clicks : 0;

  // Previous year channel data for YoY
  const prevStart = new Date(sDaily); prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd   = new Date(eDaily); prevEnd.setFullYear(prevEnd.getFullYear() - 1);
  const prevSourceData = hasPrevData ? getMarketingSourceData(
    localIsoDate(prevStart),
    localIsoDate(prevEnd),
    filters.countries,
  ) : [];
  const fbPrev = prevSourceData.find(s => s.source === 'Facebook Ads') ?? { cost: 0, clicks: 0 };
  const ggPrev = prevSourceData.find(s => s.source === 'Google Ads')   ?? { cost: 0, clicks: 0 };
  const fbCpcPrev = fbPrev.clicks > 0 ? fbPrev.cost / fbPrev.clicks : 0;
  const gCpcPrev  = ggPrev.clicks > 0 ? ggPrev.cost / ggPrev.clicks : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Marketingové investice</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>

      {/* Chart */}
      <CostPnoChart data={chartData} currency={currency} hasPrevData={hasPrevData} />

      {/* Per-channel performance */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Výkon per channel</h2>
        </div>

        {/* FB + Google summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Facebook Ads */}
          <div className="bg-white rounded-2xl border-2 border-blue-800 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Facebook Ads</span>
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <Share2 size={15} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Náklady</p>
                <p className="text-xl font-bold text-slate-900">{fc(fb.cost)}</p>
                <YoyBadge pct={yoyPct(fb.cost, fbPrev.cost)} invert />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Kliky</p>
                <p className="text-xl font-bold text-slate-900">{formatNumber(fb.clicks)}</p>
                <YoyBadge pct={yoyPct(fb.clicks, fbPrev.clicks)} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">CPC</p>
                <p className="text-xl font-bold text-slate-900">{fbCpc.toFixed(2)} {sym}</p>
                <YoyBadge pct={yoyPct(fbCpc, fbCpcPrev)} invert />
              </div>
            </div>
          </div>

          {/* Google Ads */}
          <div className="bg-white rounded-2xl border-2 border-blue-800 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-green-700">Google Ads</span>
              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
                <Search size={15} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Náklady</p>
                <p className="text-xl font-bold text-slate-900">{fc(gg.cost)}</p>
                <YoyBadge pct={yoyPct(gg.cost, ggPrev.cost)} invert />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Kliky</p>
                <p className="text-xl font-bold text-slate-900">{formatNumber(gg.clicks)}</p>
                <YoyBadge pct={yoyPct(gg.clicks, ggPrev.clicks)} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">CPC</p>
                <p className="text-xl font-bold text-slate-900">{gCpc.toFixed(2)} {sym}</p>
                <YoyBadge pct={yoyPct(gCpc, gCpcPrev)} invert />
              </div>
            </div>
          </div>
        </div>

        {/* CPC + clicks trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">CPC a kliky v čase</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={marketingChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} width={45} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={v => `${v} ${sym}`}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                width={65}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => {
                  if (name === 'FB kliky' || name === 'Google kliky') return [formatNumber(Number(value)), String(name)];
                  return [`${Number(value).toFixed(2)} ${sym}`, String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="clicks_fb" name="FB kliky"     fill={C.facebook}    opacity={0.7} stackId="c" />
              <Bar yAxisId="left" dataKey="clicks_g"  name="Google kliky" fill={C.google}      opacity={0.7} stackId="c" />
              <Line yAxisId="right" type="monotone" dataKey="cpc_fb" name="CPC Facebook" stroke={C.facebookDark} strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="cpc_g"  name="CPC Google"   stroke={C.googleDark}   strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Daily marketing table with channel breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Přehled po dnech</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 border-b border-blue-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Datum</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wide">Náklady celkem</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wide">Facebook Ads</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wide">Google Ads</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((r, idx) => (
                  <tr key={r.date} className={`border-b border-gray-50 hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                      {formatDate(new Date(r.date + 'T12:00:00'))}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-semibold">{fc(r.cost)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{fc(r.cost_facebook)}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{fc(r.cost_google)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Source breakdown table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Přehled podle zdroje</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 border-b border-blue-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Zdroj</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wide">Náklady</th>
                </tr>
              </thead>
              <tbody>
                {sourceData.map((r, idx) => (
                  <tr key={r.source} className={`border-b border-gray-50 hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-2.5 text-gray-800 font-semibold">{r.source}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(r.cost, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-semibold">
                  <td className="px-4 py-3 text-blue-600 text-xs">Celkem</td>
                  <td className="px-4 py-3 text-right">{fc(sourceData.reduce((s, r) => s + r.cost, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
