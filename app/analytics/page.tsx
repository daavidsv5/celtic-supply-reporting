'use client';

import { useEffect, useState } from 'react';
import { useFilters } from '@/hooks/useFilters';
import { getDisplayCurrency } from '@/data/types';
import { useDashboardData } from '@/hooks/useDashboardData';
import { mockData } from '@/data/mockGenerator';
import { formatCurrency } from '@/lib/formatters';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { C } from '@/lib/chartColors';
import { localIsoDate } from '@/lib/formatters';
import {
  Monitor, Smartphone, Tablet, TrendingUp, TrendingDown,
  Users, MousePointerClick, Clock, Percent,
} from 'lucide-react';
import SharedKpiCard from '@/components/kpi/KpiCard';

interface DailyRow {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
  bounceRate: number;
  avgDuration: number;
}

interface AggrRow {
  sessions: number;
  users: number;
  conversions: number;
  bounceRate: number;
  avgDuration: number;
  revenue: number;
}

interface SourceRow {
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
  users: number;
  revenue: number;
}

interface DeviceRow {
  device: string;
  sessions: number;
  users: number;
}

interface LandingPageRow {
  page: string;
  sessions: number;
  users: number;
  conversions: number;
}

interface FunnelStep {
  step: string;
  desktop: number;
  mobile: number;
  tablet: number;
  total: number;
}

interface GA4Data {
  daily: DailyRow[];
  dailyPrev: DailyRow[];
  totals: { current: AggrRow; previous: AggrRow };
  sources: SourceRow[];
  sourcesPrev: SourceRow[];
  devices: DeviceRow[];
  devicesPrev: DeviceRow[];
  landingPages: LandingPageRow[];
  funnel: FunnelStep[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funnelTrend: Record<string, any>[];
}

const FUNNEL_STEP_COLORS: Record<string, string> = {
  begin_checkout:   C.funnelStep.begin_checkout,
  add_shipping_info:C.funnelStep.add_shipping_info,
  add_payment_info: C.funnelStep.add_payment_info,
  purchase:         C.funnelStep.purchase,
};

type FunnelDevice = 'all' | 'desktop' | 'mobile' | 'tablet';
const FUNNEL_DEVICE_LABELS: Record<FunnelDevice, string> = {
  all:     'Vše',
  desktop: 'Desktop',
  mobile:  'Mobil',
  tablet:  'Tablet',
};

const FUNNEL_LABELS: Record<string, string> = {
  begin_checkout:   'Zahájení objednávky',
  add_shipping_info:'Zadání dopravy',
  add_payment_info: 'Zadání platby',
  purchase:         'Dokončení objednávky',
};

const DEVICE_COLORS: Record<string, string> = {
  desktop: C.device.desktop,
  mobile:  C.device.mobile,
  tablet:  C.device.tablet,
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <Monitor size={14} />,
  mobile:  <Smartphone size={14} />,
  tablet:  <Tablet size={14} />,
};

function fmtDate(d: string) {
  return `${d.slice(6, 8)}.${d.slice(4, 6)}.`;
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cvr(conversions: number, sessions: number) {
  if (!sessions) return 0;
  return Math.round((conversions / sessions) * 10000) / 100;
}

function yoyBadge(cur: number, prev: number) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
      up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
    }`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{pct} %
    </span>
  );
}

function yoyPct(cur: number, prev: number): number {
  if (!prev) return 0;
  return ((cur - prev) / prev) * 100;
}

export default function AnalyticsPage() {
  const { filters, getDateRange } = useFilters();
  const [data, setData]             = useState<GA4Data | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [funnelDevice, setFunnelDevice] = useState<FunnelDevice>('all');

  const { kpi: shoptetKpi, prevKpi: shoptetPrevKpi } = useDashboardData(filters, mockData);
  const currency = getDisplayCurrency(filters.countries);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { start, end } = getDateRange(filters);
    const fmt = localIsoDate;
    fetch(`/api/analytics?from=${fmt(start)}&to=${fmt(end)}&country=at`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); setData(null); }
        else setData(json);
      })
      .catch(() => setError('Nepodařilo se načíst data'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.timePeriod, filters.countries]);

  const cur  = data?.totals.current;
  const prev = data?.totals.previous;

  const curCvr  = cur  ? cvr(cur.conversions,  cur.sessions)  : 0;
  const prevCvr = prev ? cvr(prev.conversions, prev.sessions) : 0;

  const chartData = data?.daily.map((r, i) => ({
    ...r,
    dateLabel: fmtDate(r.date),
    cvr:              cvr(r.conversions, r.sessions),
    sessions_prev:    data.dailyPrev[i]?.sessions,
    users_prev:       data.dailyPrev[i]?.users,
    bounceRate_prev:  data.dailyPrev[i]?.bounceRate,
    avgDuration_prev: data.dailyPrev[i]?.avgDuration,
    cvr_prev:         data.dailyPrev[i] ? cvr(data.dailyPrev[i].conversions, data.dailyPrev[i].sessions) : undefined,
  })) ?? [];

  const totalDeviceSessions = data?.devices.reduce((s, d) => s + d.sessions, 0) ?? 1;

  const FUNNEL_STEPS_ALL = ['begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'] as const;
  const funnelTrendPct = data?.funnelTrend.map(row => {
    const base = (row[`begin_checkout_${funnelDevice}`] as number) || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = { date: row.date };
    for (const step of FUNNEL_STEPS_ALL) {
      const key = `${step}_${funnelDevice}`;
      result[key] = base > 0 ? Math.round(((row[key] as number) / base) * 1000) / 10 : null;
    }
    return result;
  }) ?? [];

  return (
    <div className="space-y-6 py-2">
      <h1 className="text-xl font-bold text-slate-900">Návštěvnost (GA4)</h1>

      {loading && <p className="text-slate-400 text-sm">Načítám data z Google Analytics…</p>}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
          Chyba: {error}
        </div>
      )}

      {data && cur && prev && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <SharedKpiCard title="Sessions"          value={cur.sessions.toLocaleString('cs-CZ')}  yoy={yoyPct(cur.sessions, prev.sessions)}       icon={<TrendingUp size={16} />}       hasPrevData={!!prev.sessions} />
            <SharedKpiCard title="Unikátní uživatelé" value={cur.users.toLocaleString('cs-CZ')}   yoy={yoyPct(cur.users, prev.users)}             icon={<Users size={16} />}            hasPrevData={!!prev.users} />
            <SharedKpiCard title="Konverze"          value={cur.conversions.toLocaleString('cs-CZ')} yoy={yoyPct(cur.conversions, prev.conversions)} icon={<MousePointerClick size={16} />} hasPrevData={!!prev.conversions} />
            <SharedKpiCard title="Konverzní poměr"   value={`${curCvr.toFixed(2)} %`}             yoy={yoyPct(curCvr, prevCvr)}                   icon={<Percent size={16} />}          hasPrevData={!!prevCvr} />
            <SharedKpiCard title="Bounce rate"       value={`${cur.bounceRate} %`}                yoy={yoyPct(cur.bounceRate, prev.bounceRate)}    icon={<TrendingDown size={16} />}     hasPrevData={!!prev.bounceRate} invertColors />
            <SharedKpiCard title="Prům. délka"       value={fmtDuration(cur.avgDuration)}         yoy={yoyPct(cur.avgDuration, prev.avgDuration)}  icon={<Clock size={16} />}            hasPrevData={!!prev.avgDuration} />
          </div>

          {/* Revenue comparison row */}
          {(() => {
            const ga4Rev      = cur.revenue;
            const ga4RevPrev  = prev.revenue;
            const shoptetRev  = shoptetKpi.revenue;
            const shoptetPrev = shoptetPrevKpi.revenue;
            const deviation   = shoptetRev > 0 ? ((ga4Rev - shoptetRev) / shoptetRev) * 100 : null;
            const deviationPrev = shoptetPrev > 0 ? ((ga4RevPrev - shoptetPrev) / shoptetPrev) * 100 : null;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* GA4 revenue */}
                <SharedKpiCard
                  title="Tržby bez DPH (GA4)"
                  value={formatCurrency(ga4Rev, currency)}
                  yoy={ga4RevPrev ? yoyPct(ga4Rev, ga4RevPrev) : null}
                  icon={<TrendingUp size={16} />}
                  hasPrevData={!!ga4RevPrev}
                />
                {/* Odchylka */}
                <div className="bg-white rounded-xl border-2 border-slate-200 shadow-sm p-4 flex flex-col gap-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Odchylka GA4 vs. Shoptet</p>
                  {deviation !== null ? (
                    <>
                      <p className={`text-2xl font-bold ${Math.abs(deviation) <= 5 ? 'text-emerald-600' : Math.abs(deviation) <= 15 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {deviation >= 0 ? '+' : ''}{deviation.toFixed(2)} %
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">
                          GA4: <span className="font-semibold text-slate-700">{formatCurrency(ga4Rev, currency)}</span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-500">
                          Shoptet: <span className="font-semibold text-slate-700">{formatCurrency(shoptetRev, currency)}</span>
                        </span>
                      </div>
                      {deviationPrev !== null && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Loni: <span className={`font-semibold ${Math.abs(deviationPrev) <= 5 ? 'text-emerald-600' : Math.abs(deviationPrev) <= 15 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {deviationPrev >= 0 ? '+' : ''}{deviationPrev.toFixed(2)} %
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-slate-400">—</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Sessions + users over time */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Sessions v čase</h2>
            <p className="text-xs text-slate-400 mb-4">Plná čára = aktuální období · přerušovaná = loni</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sessions"      name="Sessions"        stroke={C.primary}      strokeWidth={2}   dot={false} />
                <Line type="monotone" dataKey="sessions_prev" name="Sessions (loni)"  stroke={C.primaryLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Konverzní poměr v čase */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Konverzní poměr v čase</h2>
            <p className="text-xs text-slate-400 mb-4">Plná čára = aktuální období · přerušovaná = loni</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <Tooltip formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(2)} %`, String(name)]} />
                <Legend />
                <Line type="monotone" dataKey="cvr"      name="Konverzní poměr"        stroke={C.primary}      strokeWidth={2}   dot={false} />
                <Line type="monotone" dataKey="cvr_prev" name="Konverzní poměr (loni)"  stroke={C.primaryLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bounce + avg duration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Bounce rate (%)</h2>
              <p className="text-xs text-slate-400 mb-4">Plná = aktuální · přerušovaná = loni</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v: unknown, name: unknown) => [`${v} %`, String(name)]} />
                  <Legend />
                  <Line type="monotone" dataKey="bounceRate"      name="Bounce rate"       stroke={C.primary}      strokeWidth={2}   dot={false} />
                  <Line type="monotone" dataKey="bounceRate_prev" name="Bounce rate (loni)" stroke={C.primaryLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Průměrná délka návštěvy (sec)</h2>
              <p className="text-xs text-slate-400 mb-4">Plná = aktuální · přerušovaná = loni</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip formatter={(v: unknown, name: unknown) => [`${v} s`, String(name)]} />
                  <Legend />
                  <Line type="monotone" dataKey="avgDuration"      name="Délka návštěvy"       stroke={C.primary}      strokeWidth={2}   dot={false} />
                  <Line type="monotone" dataKey="avgDuration_prev" name="Délka návštěvy (loni)" stroke={C.primaryLight} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sources table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Zdroje návštěvnosti</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-900 text-white">
                    <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px]">Zdroj / Medium</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Sessions</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Podíl</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">CVR</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Transakce</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Podíl</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Tržby</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-[11px]">Podíl</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalSessions = data.sources.reduce((a, x) => a + x.sessions, 0) || 1;
                    const totalConv     = data.sources.reduce((a, x) => a + x.conversions, 0) || 1;
                    const totalRevenue  = data.sources.reduce((a, x) => a + x.revenue, 0) || 1;
                    return data.sources.slice(0, 15).map((s, i) => {
                      const prev = data.sourcesPrev.find(p => p.source === s.source && p.medium === s.medium);
                      const sessPct  = Math.round((s.sessions    / totalSessions) * 100);
                      const convPct  = Math.round((s.conversions / totalConv)     * 100);
                      const revPct   = Math.round((s.revenue     / totalRevenue)  * 100);
                      const srcCvr   = s.sessions > 0 ? (s.conversions / s.sessions * 100) : 0;
                      const prevCvrV = prev && prev.sessions > 0 ? (prev.conversions / prev.sessions * 100) : 0;
                      return (
                        <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/70 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-4 py-2.5 text-slate-700 font-medium max-w-[200px] truncate">
                            {s.source} / {s.medium}
                          </td>
                          {/* Sessions */}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{s.sessions.toLocaleString('cs-CZ')}</span>
                              {prev && yoyBadge(s.sessions, prev.sessions)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-slate-500 font-semibold">{sessPct} %</span>
                              <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${sessPct}%` }} />
                              </div>
                            </div>
                          </td>
                          {/* CVR */}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{srcCvr.toFixed(2)} %</span>
                              {prev && yoyBadge(srcCvr, prevCvrV)}
                            </div>
                          </td>
                          {/* Transakce */}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">{s.conversions.toLocaleString('cs-CZ')}</span>
                              {prev && yoyBadge(s.conversions, prev.conversions)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-slate-500 font-semibold">{convPct} %</span>
                              <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-emerald-500 rounded-full" style={{ width: `${convPct}%` }} />
                              </div>
                            </div>
                          </td>
                          {/* Tržby */}
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-slate-800">
                                {s.revenue.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Kč
                              </span>
                              {prev && yoyBadge(s.revenue, prev.revenue)}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-slate-500 font-semibold">{revPct} %</span>
                              <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-indigo-500 rounded-full" style={{ width: `${revPct}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Zařízení</h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={data.devices} dataKey="sessions" nameKey="device" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {data.devices.map((d, i) => (
                        <Cell key={i} fill={DEVICE_COLORS[d.device] ?? '#cbd5e1'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString('cs-CZ'), 'Sessions']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {data.devices.map((d, i) => {
                    const prevDev = data.devicesPrev.find(p => p.device === d.device);
                    return (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span style={{ color: DEVICE_COLORS[d.device] ?? '#94a3b8' }}>{DEVICE_ICONS[d.device] ?? null}</span>
                          <span className="capitalize">{d.device}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{Math.round((d.sessions / totalDeviceSessions) * 100)} %</span>
                          <span className="text-xs text-slate-400">({d.sessions.toLocaleString('cs-CZ')})</span>
                          {prevDev && yoyBadge(d.sessions, prevDev.sessions)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Funnel trend chart */}
          {data.funnelTrend && data.funnelTrend.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Průchodnost košíkem v čase</h2>
                  <p className="text-xs text-slate-400 mt-0.5">% dokončení každého kroku z celkového počtu zahájení objednávky</p>
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['all', 'desktop', 'mobile', 'tablet'] as FunnelDevice[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setFunnelDevice(d)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        funnelDevice === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {d === 'desktop' && <Monitor size={11} />}
                      {d === 'mobile'  && <Smartphone size={11} />}
                      {d === 'tablet'  && <Tablet size={11} />}
                      {FUNNEL_DEVICE_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={funnelTrendPct} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => `${d.slice(6, 8)}.${d.slice(4, 6)}.`} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    labelFormatter={d => `${String(d).slice(6, 8)}.${String(d).slice(4, 6)}.${String(d).slice(0, 4)}`}
                    formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)} %`, String(name)]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={`purchase_${funnelDevice}`}
                    name="CVR trychtýře"
                    stroke={C.primary}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Checkout funnel */}
          {data.funnel && data.funnel.some(s => s.total > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Trychtýř průchodnosti košíkem</h2>
                <p className="text-xs text-slate-400 mt-0.5">Rozpad na desktop · mobilní zařízení · tablet</p>
              </div>
              <div className="p-5 space-y-3">
                {data.funnel.map((step, i) => {
                  const top     = data.funnel[0].total || 1;
                  const prevTotal = i > 0 ? data.funnel[i - 1].total || 1 : step.total;
                  const pctOfTop  = step.total / top * 100;
                  const dropOff   = i > 0 ? 100 - (step.total / prevTotal * 100) : null;
                  const dPct = step.total > 0 ? step.desktop / step.total * 100 : 0;
                  const mPct = step.total > 0 ? step.mobile  / step.total * 100 : 0;
                  const tPct = step.total > 0 ? step.tablet  / step.total * 100 : 0;
                  return (
                    <div key={step.step}>
                      {i > 0 && (
                        <div className="flex items-center gap-2 py-1 pl-4">
                          <div className="w-px h-4 bg-slate-200" />
                          <span className="text-xs text-rose-500 font-medium">
                            -{dropOff!.toFixed(1)} % odpad
                          </span>
                        </div>
                      )}
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                            <span className="text-sm font-semibold text-slate-700">{FUNNEL_LABELS[step.step] ?? step.step}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-slate-800">{step.total.toLocaleString('cs-CZ')}</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{pctOfTop.toFixed(1)} % z 1. kroku</span>
                          </div>
                        </div>
                        {/* Stacked bar */}
                        <div className="h-5 rounded-lg overflow-hidden flex" style={{ width: `${Math.max(pctOfTop, 2)}%`, minWidth: '4px', transition: 'width 0.4s ease' }}>
                          <div className="h-full" style={{ width: `${dPct}%`, background: C.device.desktop }} title={`Desktop: ${step.desktop.toLocaleString('cs-CZ')}`} />
                          <div className="h-full" style={{ width: `${mPct}%`, background: C.device.mobile  }} title={`Mobile: ${step.mobile.toLocaleString('cs-CZ')}`} />
                          <div className="h-full" style={{ width: `${tPct}%`, background: C.device.tablet  }} title={`Tablet: ${step.tablet.toLocaleString('cs-CZ')}`} />
                        </div>
                        {/* Device breakdown */}
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.device.desktop }} />
                            <Monitor size={11} style={{ color: C.device.desktop }} /> Desktop {step.desktop.toLocaleString('cs-CZ')} ({dPct.toFixed(0)} %)
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.device.mobile }} />
                            <Smartphone size={11} style={{ color: C.device.mobile }} /> Mobil {step.mobile.toLocaleString('cs-CZ')} ({mPct.toFixed(0)} %)
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C.device.tablet }} />
                            <Tablet size={11} style={{ color: C.device.tablet }} /> Tablet {step.tablet.toLocaleString('cs-CZ')} ({tPct.toFixed(0)} %)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Per-device conversion table */}
              <div className="border-t border-slate-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Zařízení</th>
                      {data.funnel.map(s => (
                        <th key={s.step} className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">{FUNNEL_LABELS[s.step] ?? s.step}</th>
                      ))}
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">CVR (celý trychtýř)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['desktop', 'mobile', 'tablet'] as const).map((dev, i) => {
                      const top = data.funnel[0]?.[dev] || 1;
                      const bottom = data.funnel[data.funnel.length - 1]?.[dev] ?? 0;
                      const funCvr = (bottom / top * 100).toFixed(2);
                      const icons = { desktop: <Monitor size={13} />, mobile: <Smartphone size={13} />, tablet: <Tablet size={13} /> };
                      const colors = { desktop: 'text-blue-600', mobile: 'text-emerald-600', tablet: 'text-amber-600' };
                      return (
                        <tr key={dev} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className={`px-4 py-2.5 font-medium flex items-center gap-1.5 ${colors[dev]}`}>
                            {icons[dev]} <span className="capitalize text-slate-700">{dev === 'mobile' ? 'Mobil' : dev === 'desktop' ? 'Desktop' : 'Tablet'}</span>
                          </td>
                          {data.funnel.map((s, si) => {
                            const stepTop = si > 0 ? data.funnel[si - 1][dev] || 1 : data.funnel[0][dev] || 1;
                            const pct = si > 0 ? (s[dev] / stepTop * 100).toFixed(1) : '100.0';
                            return (
                              <td key={s.step} className="px-4 py-2.5 text-right">
                                <span className="font-semibold text-slate-800">{s[dev].toLocaleString('cs-CZ')}</span>
                                {si > 0 && <span className="ml-1.5 text-xs text-slate-400">({pct} %)</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold text-sm ${Number(funCvr) >= 2 ? 'text-emerald-600' : Number(funCvr) >= 1 ? 'text-amber-600' : 'text-slate-500'}`}>
                              {funCvr} %
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-100 font-semibold">
                      <td className="px-4 py-3 text-blue-600 text-xs">Celkem</td>
                      {data.funnel.map((s, si) => {
                        const stepTop = si > 0 ? data.funnel[si - 1].total || 1 : s.total || 1;
                        const pct = si > 0 ? (s.total / stepTop * 100).toFixed(1) : '100.0';
                        return (
                          <td key={s.step} className="px-4 py-3 text-right">
                            <span className="text-slate-700">{s.total.toLocaleString('cs-CZ')}</span>
                            {si > 0 && <span className="ml-1.5 text-xs text-slate-400">({pct} %)</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-bold text-slate-700">
                        {data.funnel[0]?.total ? (data.funnel[data.funnel.length - 1].total / data.funnel[0].total * 100).toFixed(2) : '0.00'} %
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Landing pages table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Vstupní stránky dle návštěvnosti</h2>
              <p className="text-xs text-slate-400 mt-0.5">Top 20 vstupních stránek za vybrané období</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-900">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wider w-8">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Vstupní stránka</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Sessions</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Uživatelé</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Konverze</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">CVR</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Podíl</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalSessions = data.landingPages.reduce((s, r) => s + r.sessions, 0) || 1;
                    return data.landingPages.map((r, idx) => {
                      const pct = (r.sessions / totalSessions) * 100;
                      const cvrVal = cvr(r.conversions, r.sessions);
                      return (
                        <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-4 py-2.5 text-slate-300 text-xs tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2.5 text-slate-700 font-mono text-xs max-w-[340px] truncate" title={r.page}>{r.page}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{r.sessions.toLocaleString('cs-CZ')}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{r.users.toLocaleString('cs-CZ')}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{r.conversions.toLocaleString('cs-CZ')}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <span className={`text-xs font-semibold ${cvrVal >= 2 ? 'text-emerald-600' : cvrVal >= 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {cvrVal.toFixed(2)} %
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-semibold text-slate-500">{pct.toFixed(1)} %</span>
                              <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct * 3)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50/60 border-t-2 border-blue-100">
                    <td className="px-4 py-3 text-blue-500 text-xs" colSpan={2}>Celkem (top 20)</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700 tabular-nums">{data.landingPages.reduce((s, r) => s + r.sessions, 0).toLocaleString('cs-CZ')}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{data.landingPages.reduce((s, r) => s + r.users, 0).toLocaleString('cs-CZ')}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{data.landingPages.reduce((s, r) => s + r.conversions, 0).toLocaleString('cs-CZ')}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
