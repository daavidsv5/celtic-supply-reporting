'use client';

import { useEffect, useState } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { getDisplayCurrency } from '@/data/types';
import { localIsoDate, formatCurrency, formatNumber, formatDate, formatShortDate } from '@/lib/formatters';
import { TrendingUp, MousePointerClick, ShoppingCart, Eye, Target, Percent, CreditCard } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { C } from '@/lib/chartColors';

interface GoogleKpi {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  convValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

interface GoogleCampaign {
  name: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  cpc: number;
  conversions: number;
  convValue: number;
  cpa: number;
}

type SortKey = 'spend' | 'clicks' | 'impressions' | 'conversions' | 'convValue' | 'cpa' | 'roas';

const SORT_LABELS: Record<SortKey, string> = {
  spend: 'Útrata', clicks: 'Kliky', impressions: 'Imprese',
  conversions: 'Konverze', convValue: 'Tržby', cpa: 'CPA', roas: 'ROAS',
};

function pct(v: number) {
  return `${v.toFixed(2).replace('.', ',')} %`;
}

function roasColor(v: number) {
  if (v >= 5) return 'text-emerald-600';
  if (v >= 3) return 'text-amber-600';
  return 'text-rose-500';
}

function yoyChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function campaignStatusBadge(status: string) {
  if (status === 'ENABLED') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Aktivní</span>;
  }
  if (status === 'PAUSED') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pozastaveno</span>;
  }
  return null;
}

export default function GoogleAdsPage() {
  const { filters } = useFilters();
  const [kpi, setKpi]         = useState<GoogleKpi | null>(null);
  const [prevKpi, setPrevKpi] = useState<GoogleKpi | null>(null);
  const [campaigns, setCampaigns] = useState<GoogleCampaign[]>([]);
  const [daily, setDaily]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const currency = getDisplayCurrency(filters.countries);
  const fc = (v: number) => formatCurrency(v, currency);

  const { start, end } = getDateRange(filters);
  const from = localIsoDate(start);
  const to   = localIsoDate(end);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/google-ads?from=${from}&to=${to}&country=sk`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        setKpi(json.kpi);
        setPrevKpi(json.prevKpi ?? null);
        setCampaigns(json.campaigns ?? []);
        setDaily(json.daily ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const v = sortDir === 'desc' ? -1 : 1;
    const av = sortKey === 'roas' ? (a.spend > 0 ? a.convValue / a.spend : 0) : (a as any)[sortKey];
    const bv = sortKey === 'roas' ? (b.spend > 0 ? b.convValue / b.spend : 0) : (b as any)[sortKey];
    return (av - bv) * v;
  });

  const p = prevKpi;
  const hasPrev = p !== null && (p.spend > 0 || p.conversions > 0);

  const kpiCards = kpi ? [
    { label: 'Útrata',         value: fc(kpi.spend),               icon: CreditCard,         color: 'rose',   yoy: hasPrev ? yoyChange(kpi.spend,       p!.spend)       : null, invertYoy: true },
    { label: 'Kliky',          value: formatNumber(kpi.clicks),     icon: MousePointerClick,  color: 'blue',   yoy: hasPrev ? yoyChange(kpi.clicks,      p!.clicks)      : null, invertYoy: false },
    { label: 'Imprese',        value: formatNumber(kpi.impressions),icon: Eye,                color: 'blue',   yoy: hasPrev ? yoyChange(kpi.impressions, p!.impressions) : null, invertYoy: false },
    { label: 'CTR',            value: pct(kpi.ctr),                 icon: Percent,            color: 'indigo', yoy: hasPrev ? yoyChange(kpi.ctr,         p!.ctr)         : null, invertYoy: false },
    { label: 'CPC',            value: fc(kpi.cpc),                  icon: Target,             color: 'indigo', yoy: hasPrev ? yoyChange(kpi.cpc,         p!.cpc)         : null, invertYoy: true },
    { label: 'Konverze',       value: formatNumber(kpi.conversions),icon: ShoppingCart,       color: 'green',  yoy: hasPrev ? yoyChange(kpi.conversions, p!.conversions) : null, invertYoy: false },
    { label: 'Tržby z reklam', value: fc(kpi.convValue),            icon: TrendingUp,         color: 'green',  yoy: hasPrev ? yoyChange(kpi.convValue,   p!.convValue)   : null, invertYoy: false },
    { label: 'CPA',            value: kpi.cpa > 0 ? fc(kpi.cpa) : '–', icon: Target,         color: kpi.cpa > 0 ? 'orange' : 'slate', yoy: hasPrev ? yoyChange(kpi.cpa, p!.cpa) : null, invertYoy: true },
    { label: 'ROAS',           value: kpi.roas > 0 ? `${kpi.roas.toFixed(2).replace('.', ',')}x` : '–', icon: TrendingUp, color: kpi.roas >= 3 ? 'green' : 'orange', yoy: hasPrev ? yoyChange(kpi.roas, p!.roas) : null, invertYoy: false },
  ] : [];

  const colorMap: Record<string, string> = {
    blue:   'border-blue-200 bg-blue-50',
    green:  'border-emerald-200 bg-emerald-50',
    rose:   'border-rose-200 bg-rose-50',
    indigo: 'border-indigo-200 bg-indigo-50',
    orange: 'border-amber-200 bg-amber-50',
    slate:  'border-slate-200 bg-slate-50',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-500', green: 'text-emerald-600', rose: 'text-rose-500',
    indigo: 'text-indigo-500', orange: 'text-amber-500', slate: 'text-slate-400',
  };

  const thBase = 'px-3 py-3 text-[11px] font-semibold text-white uppercase tracking-wider cursor-pointer select-none hover:bg-blue-700 transition-colors';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Google Ads</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {formatDate(start)} – {formatDate(end)} · SK
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          Načítám data z Google Ads…
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          Chyba: {error}
        </div>
      )}

      {!loading && !error && kpi && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {kpiCards.map(({ label, value, icon: Icon, color, yoy, invertYoy }) => {
              const isPositive = yoy !== null && (invertYoy ? yoy < 0 : yoy > 0);
              const isNegative = yoy !== null && (invertYoy ? yoy > 0 : yoy < 0);
              return (
                <div key={label} className={`rounded-xl border p-4 ${colorMap[color]}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500 font-medium leading-tight">{label}</span>
                    <Icon size={14} className={iconColorMap[color]} />
                  </div>
                  <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
                  {yoy !== null && (
                    <p className={`text-[11px] font-medium mt-1 ${isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-500' : 'text-slate-400'}`}>
                      {yoy > 0 ? '+' : ''}{yoy.toFixed(1).replace('.', ',')} % YoY
                    </p>
                  )}
                  {yoy === null && hasPrev === false && (
                    <p className="text-[11px] text-slate-300 mt-1">– YoY</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grafy */}
          {daily.length > 1 && (() => {
            const chartCard = (title: string, children: React.ReactNode) => (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-5">{title}</h2>
                <ResponsiveContainer width="100%" height={220}>
                  {children as React.ReactElement}
                </ResponsiveContainer>
              </div>
            );

            const axisProps = {
              tick: { fontSize: 11, fill: '#94a3b8' },
              axisLine: false as const,
              tickLine: false as const,
            };

            const tooltip = (formatter: (v: number) => string) => (
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: any) => [formatter(Number(v)), '']}
                labelFormatter={(l: any) => typeof l === 'string' ? formatShortDate(l) : l}
                cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
              />
            );

            return (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {chartCard('CPC – Cena za klik',
                  <LineChart data={daily} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => `${v.toFixed(2).replace('.', ',')} €`} width={56} {...axisProps} />
                    {tooltip(v => `${v.toFixed(2).replace('.', ',')} €`)}
                    <Line type="monotone" dataKey="cpc" stroke={C.aov} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
                {chartCard('CPA – Cena za konverzi',
                  <LineChart data={daily.filter(d => d.cpa > 0)} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => `${Math.round(v)} €`} width={56} {...axisProps} />
                    {tooltip(v => `${Math.round(v)} €`)}
                    <Line type="monotone" dataKey="cpa" stroke={C.cost} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
                {chartCard('Konverze',
                  <LineChart data={daily} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => String(Math.round(v))} width={32} {...axisProps} />
                    {tooltip(v => String(Math.round(v)))}
                    <Line type="monotone" dataKey="conversions" stroke={C.margin} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
                {chartCard('ROAS',
                  <LineChart data={daily.filter(d => d.roas > 0)} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => `${v.toFixed(1).replace('.', ',')}x`} width={40} {...axisProps} />
                    {tooltip(v => `${v.toFixed(2).replace('.', ',')}x`)}
                    <Line type="monotone" dataKey="roas" stroke={C.grossProfit} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
              </div>
            );
          })()}

          {/* Tabulka kampaní */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Výkonnost kampaní</h2>
              <span className="text-xs text-slate-400">{sortedCampaigns.length} kampaní</span>
            </div>

            {/* Sort pills */}
            <div className="px-5 py-2 flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-400 self-center mr-1">Řadit dle:</span>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sortKey === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}
                >
                  {SORT_LABELS[key]} {sortKey === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-900">
                    <th className={`${thBase} text-left`} style={{ minWidth: 220 }}>Kampaň</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('spend')}>Útrata</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('clicks')}>Kliky</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('impressions')}>Imprese</th>
                    <th className={`${thBase} text-right`}>CPC</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('conversions')}>Konverze</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('convValue')}>Tržby z reklam</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('cpa')}>CPA</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('roas')}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c, idx) => {
                    const roas = c.spend > 0 ? c.convValue / c.spend : 0;
                    return (
                      <tr
                        key={c.name}
                        className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                      >
                        <td className="px-3 py-2.5">
                          <p className="text-slate-700 text-xs font-medium leading-snug">{c.name}</p>
                          {c.status && <div className="mt-1">{campaignStatusBadge(c.status)}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700 font-semibold tabular-nums">{fc(c.spend)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(c.clicks)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(c.impressions)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{fc(c.cpc)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 font-semibold tabular-nums">{formatNumber(c.conversions)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">{c.convValue > 0 ? fc(c.convValue) : '–'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{c.cpa > 0 ? fc(c.cpa) : '–'}</td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${roasColor(roas)}`}>
                          {roas > 0 ? `${roas.toFixed(2).replace('.', ',')}x` : '–'}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedCampaigns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Žádná data pro vybrané období
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
