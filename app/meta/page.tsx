'use client';

import { useEffect, useState } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { getDisplayCurrency } from '@/data/types';
import { localIsoDate, formatCurrency, formatNumber, formatDate, formatShortDate } from '@/lib/formatters';
import { TrendingUp, Users, MousePointerClick, ShoppingCart, Eye, Target, Percent, CreditCard, Image } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { C } from '@/lib/chartColors';

interface MetaKpi {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  initCheckout: number;
  cpa: number;
  roas: number;
}

interface MetaAd {
  id: string;
  name: string;
  campaignName: string;
  adsetName: string;
  thumbnail: string;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  cpa: number;
  roas: number;
  status: string;
}

type SortKey = 'spend' | 'reach' | 'clicks' | 'ctr' | 'purchases' | 'purchaseValue' | 'cpa' | 'roas' | 'addToCart';

const SORT_LABELS: Record<SortKey, string> = {
  spend: 'Útrata', reach: 'Dosah', clicks: 'Kliky', ctr: 'CTR',
  purchases: 'Nákupy', purchaseValue: 'Tržby z reklam', cpa: 'CPA', roas: 'ROAS', addToCart: 'Košík',
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

function adStatusBadge(status: string) {
  if (status === 'ACTIVE') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Aktivní</span>;
  }
  if (status.includes('PAUSED')) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pozastaveno</span>;
  }
  return null;
}

function cpaColor(v: number, avg: number) {
  if (avg === 0) return 'text-slate-700';
  if (v <= avg * 0.8) return 'text-emerald-600';
  if (v <= avg * 1.2) return 'text-amber-600';
  return 'text-rose-500';
}

export default function MetaPage() {
  const { filters } = useFilters();
  const [kpi, setKpi]         = useState<MetaKpi | null>(null);
  const [prevKpi, setPrevKpi] = useState<MetaKpi | null>(null);
  const [daily, setDaily]     = useState<any[]>([]);
  const [ads, setAds]         = useState<MetaAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [sortKey, setSortKey]         = useState<SortKey>('spend');
  const [sortDir, setSortDir]         = useState<'desc' | 'asc'>('desc');
  const [filterCampaign, setFilterCampaign] = useState<string>('');
  const [filterAdset, setFilterAdset]       = useState<string>('');

  const fc = (v: number) => formatCurrency(v, getDisplayCurrency(filters.countries));

  const { start, end } = getDateRange(filters);
  const from = localIsoDate(start);
  const to   = localIsoDate(end);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/meta?from=${from}&to=${to}&country=at`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        setKpi(json.kpi);
        setPrevKpi(json.prevKpi ?? null);
        setDaily(json.daily ?? []);
        setAds(json.ads ?? []);
        setFilterCampaign('');
        setFilterAdset('');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const campaigns = [...new Set(ads.map(a => a.campaignName))].sort();
  const adsets    = [...new Set(
    ads.filter(a => !filterCampaign || a.campaignName === filterCampaign).map(a => a.adsetName)
  )].sort();

  const filteredAds = ads.filter(a =>
    (!filterCampaign || a.campaignName === filterCampaign) &&
    (!filterAdset    || a.adsetName    === filterAdset)
  );

  const sortedAds = [...filteredAds].sort((a, b) => {
    const v = (sortDir === 'desc' ? -1 : 1);
    return (a[sortKey] - b[sortKey]) * v;
  });

  const avgCpa = kpi && kpi.purchases > 0 ? kpi.cpa : 0;

  const p = prevKpi;
  const hasPrev = p !== null && (p.spend > 0 || p.purchases > 0);

  const kpiCards = kpi ? [
    { label: 'Útrata',         value: fc(kpi.spend),          icon: CreditCard,        color: 'rose',   yoy: hasPrev ? yoyChange(kpi.spend,         p!.spend)         : null, invertYoy: true },
    { label: 'Dosah',          value: formatNumber(kpi.reach), icon: Users,             color: 'blue',   yoy: hasPrev ? yoyChange(kpi.reach,         p!.reach)         : null, invertYoy: false },
    { label: 'Imprese',        value: formatNumber(kpi.impressions), icon: Eye,         color: 'blue',   yoy: hasPrev ? yoyChange(kpi.impressions,   p!.impressions)   : null, invertYoy: false },
    { label: 'Kliky',          value: formatNumber(kpi.clicks), icon: MousePointerClick, color: 'blue',  yoy: hasPrev ? yoyChange(kpi.clicks,        p!.clicks)        : null, invertYoy: false },
    { label: 'CTR',            value: pct(kpi.ctr),            icon: Percent,           color: 'indigo', yoy: hasPrev ? yoyChange(kpi.ctr,           p!.ctr)           : null, invertYoy: false },
    { label: 'CPC',            value: `${kpi.cpc.toFixed(2).replace('.', ',')} €`, icon: Target, color: 'indigo', yoy: hasPrev ? yoyChange(kpi.cpc, p!.cpc) : null, invertYoy: true },
    { label: 'Nákupy',         value: formatNumber(kpi.purchases), icon: ShoppingCart,  color: 'green',  yoy: hasPrev ? yoyChange(kpi.purchases,     p!.purchases)     : null, invertYoy: false },
    { label: 'Tržby z reklam', value: fc(kpi.purchaseValue),   icon: TrendingUp,        color: 'green',  yoy: hasPrev ? yoyChange(kpi.purchaseValue, p!.purchaseValue) : null, invertYoy: false },
    { label: 'CPA',            value: fc(kpi.cpa),             icon: Target,            color: kpi.cpa > 0 ? 'orange' : 'slate', yoy: hasPrev ? yoyChange(kpi.cpa, p!.cpa) : null, invertYoy: true },
    { label: 'ROAS',           value: kpi.roas.toFixed(2).replace('.', ',') + 'x', icon: TrendingUp, color: kpi.roas >= 3 ? 'green' : 'orange', yoy: hasPrev ? yoyChange(kpi.roas, p!.roas) : null, invertYoy: false },
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
        <h1 className="text-xl font-bold text-slate-900">Meta Ads</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {formatDate(start)} – {formatDate(end)} · AT
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          Načítám data z Meta…
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
                    <YAxis tickFormatter={v => `${v.toFixed(2).replace('.', ',')} €`} width={64} {...axisProps} />
                    {tooltip(v => `${v.toFixed(2).replace('.', ',')} €`)}
                    <Line type="monotone" dataKey="cpc" stroke={C.aov} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
                {chartCard('CPA – Cena za nákup',
                  <LineChart data={daily.filter(d => d.cpa > 0)} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => `${Math.round(v)} €`} width={64} {...axisProps} />
                    {tooltip(v => `${Math.round(v)} €`)}
                    <Line type="monotone" dataKey="cpa" stroke={C.cost} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                )}
                {chartCard('Nákupy',
                  <LineChart data={daily} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} interval="preserveStartEnd" {...axisProps} />
                    <YAxis tickFormatter={v => String(Math.round(v))} width={32} {...axisProps} />
                    {tooltip(v => String(Math.round(v)))}
                    <Line type="monotone" dataKey="purchases" stroke={C.margin} strokeWidth={2.5} dot={false} connectNulls />
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

          {/* Tabulka kreativ */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Výkonnost kreativ</h2>
              <span className="text-xs text-slate-400">{sortedAds.length} / {ads.length} reklam</span>
            </div>

            {/* Filtry */}
            <div className="px-5 py-3 flex flex-wrap gap-3 border-b border-slate-100 bg-slate-50/30">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">Kampaň:</label>
                <select
                  value={filterCampaign}
                  onChange={e => { setFilterCampaign(e.target.value); setFilterAdset(''); }}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 max-w-[220px]"
                >
                  <option value="">Všechny</option>
                  {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">Sada reklam:</label>
                <select
                  value={filterAdset}
                  onChange={e => setFilterAdset(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 max-w-[220px]"
                >
                  <option value="">Všechny</option>
                  {adsets.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {(filterCampaign || filterAdset) && (
                <button
                  onClick={() => { setFilterCampaign(''); setFilterAdset(''); }}
                  className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                >
                  Zrušit filtry ×
                </button>
              )}
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
                    <th className={`${thBase} text-left`} style={{ minWidth: 180 }}>Kreativa</th>
                    <th className={`${thBase} text-left`} style={{ minWidth: 160 }}>Kampaň</th>
                    <th className={`${thBase} text-left`} style={{ minWidth: 160 }}>Sada reklam</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('spend')}>Útrata</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('reach')}>Dosah</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('clicks')}>Kliky</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('ctr')}>CTR</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('addToCart')}>Košík</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('purchases')}>Nákupy</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('purchaseValue')}>Tržby z reklam</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('cpa')}>CPA</th>
                    <th className={`${thBase} text-right`} onClick={() => toggleSort('roas')}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAds.map((ad, idx) => (
                    <tr
                      key={ad.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      {/* Kreativa */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {ad.thumbnail ? (
                            <img
                              src={ad.thumbnail}
                              alt={ad.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-slate-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <Image size={16} className="text-slate-300" />
                            </div>
                          )}
                          <div>
                            <p className="text-slate-700 text-xs font-medium leading-snug line-clamp-2" style={{ maxWidth: 180 }}>{ad.name}</p>
                            {ad.status && <div className="mt-1">{adStatusBadge(ad.status)}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <span className="text-slate-600 text-xs line-clamp-2" style={{ maxWidth: 160 }} title={ad.campaignName}>{ad.campaignName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <span className="text-slate-600 text-xs line-clamp-2" style={{ maxWidth: 160 }} title={ad.adsetName}>{ad.adsetName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold tabular-nums">{fc(ad.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(ad.reach)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(ad.clicks)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{pct(ad.ctr)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(ad.addToCart)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold tabular-nums">{formatNumber(ad.purchases)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">{ad.purchaseValue > 0 ? fc(ad.purchaseValue) : '–'}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${cpaColor(ad.cpa, avgCpa)}`}>
                        {ad.cpa > 0 ? fc(ad.cpa) : '–'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${roasColor(ad.roas)}`}>
                        {ad.roas > 0 ? `${ad.roas.toFixed(2).replace('.', ',')}x` : '–'}
                      </td>
                    </tr>
                  ))}
                  {sortedAds.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-sm">
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
