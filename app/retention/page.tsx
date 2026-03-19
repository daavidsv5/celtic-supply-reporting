'use client';

import { useState, useMemo } from 'react';
import { Users, DollarSign, ShoppingCart, RefreshCw, Calendar, TrendingUp } from 'lucide-react';
import { retentionDataCZ } from '@/data/retentionDataCZ';
import { retentionDataSK } from '@/data/retentionDataSK';
import {
  computeRetentionKpis,
  computeYearCustomerMetrics,
  computeYearRetentionMetrics,
  computeYearRevenueMetrics,
  computeMonthlyChartData,
  computePurchaseDistribution,
  computeDaysBetweenHistogram,
} from '@/lib/retentionUtils';
import { formatCurrency, formatPercent, formatNumber, formatShortDate } from '@/lib/formatters';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

type Tab = 'cz' | 'sk';

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-800 p-4 flex items-start justify-between">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      </div>
      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 flex-shrink-0">
        {icon}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">{title}</h2>
      {children}
    </div>
  );
}

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

const thClass = 'px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider whitespace-nowrap';
const tdClass = 'px-4 py-2.5 whitespace-nowrap';

function fmtYAxis(v: number, currency: 'CZK' | 'EUR') {
  const s = currency === 'EUR' ? '€' : 'Kč';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ${s}`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k ${s}`;
  return `${Math.round(v)} ${s}`;
}

export default function RetentionPage() {
  const [tab, setTab] = useState<Tab>('cz');

  const data = tab === 'cz' ? retentionDataCZ : retentionDataSK;
  const currency = tab === 'cz' ? 'CZK' : 'EUR';
  const fc = (v: number) => formatCurrency(v, currency);
  const fp = (v: number) => formatPercent(v, 1);

  const kpis         = useMemo(() => computeRetentionKpis(data), [data]);
  const yearCustomer = useMemo(() => computeYearCustomerMetrics(data), [data]);
  const yearRetention= useMemo(() => computeYearRetentionMetrics(data), [data]);
  const yearRevenue  = useMemo(() => computeYearRevenueMetrics(data), [data]);
  const monthly      = useMemo(() => computeMonthlyChartData(data), [data]);
  const purchaseDist = useMemo(() => computePurchaseDistribution(data), [data]);
  const daysBins     = useMemo(() => computeDaysBetweenHistogram(data), [data]);

  const totalOrders      = yearCustomer.reduce((s, r) => s + r.orders, 0);
  const totalNewCustomers= yearCustomer.reduce((s, r) => s + r.newCustomers, 0);
  const totalReturning   = yearCustomer.reduce((s, r) => s + r.returningCustomers, 0);
  const totalRevAll      = yearRevenue.reduce((s, r) => s + r.totalRevenue, 0);

  // Yearly revenue for area chart
  const yearRevenueChart = yearRevenue.map(r => ({ year: r.year.toString(), obrat: Math.round(r.totalRevenue) }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Retenční analýza zákazníků</h1>
          <p className="text-sm text-slate-500 mt-0.5">Analýza nákupního chování zákazníků</p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
          {(['cz', 'sk'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-slate-600'
              }`}
            >
              <span>{t === 'cz' ? '🇨🇿' : '🇸🇰'}</span> {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{formatNumber(totalOrders)}</span> objednávek
        {' '}•{' '}
        <span className="font-semibold text-slate-700">{formatNumber(kpis.totalCustomers)}</span> zákazníků
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="Celkem zákazníků"   value={formatNumber(kpis.totalCustomers)}            icon={<Users size={18} />} />
        <StatCard title="Celkový obrat"       value={fc(kpis.totalRevenue)}                         icon={<DollarSign size={18} />} />
        <StatCard title="Ø objednávka"        value={fc(kpis.avgOrderValue)}                        icon={<ShoppingCart size={18} />} />
        <StatCard title="Opakovaný nákup"     value={fp(kpis.repeatPurchaseRate)}                   icon={<RefreshCw size={18} />} />
        <StatCard title="Ø dní mezi nákupy"   value={`${Math.round(kpis.avgDaysBetween)} dní`}      icon={<Calendar size={18} />} />
        <StatCard title="LTV / zákazník"      value={fc(kpis.ltvPerCustomer)}                       icon={<TrendingUp size={18} />} />
      </div>

      {/* Charts — řada 1: LTV + AOV */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Vývoj LTV v čase">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => fmtYAxis(v, currency)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v: number) => [fc(v), 'LTV / zákazník']} labelFormatter={formatShortDate} />
              <Line type="monotone" dataKey="ltv" name="LTV" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vývoj průměrné objednávky v čase">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => fmtYAxis(v, currency)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v: number) => [fc(v), 'Ø objednávka']} labelFormatter={formatShortDate} />
              <Line type="monotone" dataKey="aov" name="Ø objednávka" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts — řada 2: Obrat po letech + Zákazníci podle počtu nákupů */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Vývoj obratu po letech">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={yearRevenueChart} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="gradObrat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtYAxis(v, currency)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v: number) => [fc(v), 'Obrat']} />
              <Area type="monotone" dataKey="obrat" name="Obrat" stroke="#3b82f6" fill="url(#gradObrat)" strokeWidth={2} dot={{ r: 5, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Zákazníci podle počtu nákupů">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={purchaseDist} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)} %`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)} %`, 'Podíl zákazníků']} />
              <Bar dataKey="customersPct" name="Zákazníci %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts — řada 3: Obrat podle nákupů + Prodleva */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Obrat podle počtu nákupů">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={purchaseDist} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)} %`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)} %`, 'Podíl obratu']} />
              <Bar dataKey="revenuePct" name="Obrat %" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Prodleva mezi nákupy">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daysBins} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)} %`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)} %`, 'Podíl']} />
              <Bar dataKey="pct" name="Prodleva %" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts — řada 4: 1. vs opakovaný nákup + Noví vs stávající */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Průměrná objednávka: 1. nákup vs. opakovaný">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={yearCustomer} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtYAxis(v, currency)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v: number) => [fc(v)]} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} iconType="square" iconSize={9} />
              <Bar dataKey="avgFirstPurchase"  name="1. nákup"          fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={24} />
              <Bar dataKey="avgRepeatPurchase" name="Opakovaný nákup"   fill="#0ea5e9" radius={[3, 3, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Noví vs. stávající zákazníci">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={yearCustomer} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} iconType="square" iconSize={9} />
              <Bar dataKey="newCustomers"       name="Noví zákazníci"      fill="#22c55e" radius={[3, 3, 0, 0]} barSize={24} />
              <Bar dataKey="returningCustomers" name="Stávající zákazníci" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Zákaznické metriky */}
      <TableCard title="Zákaznické metriky">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-b border-blue-800">
              <th className={`${thClass} text-left`}>Rok</th>
              <th className={`${thClass} text-right`}>Zákazníků</th>
              <th className={`${thClass} text-right`}>Nových</th>
              <th className={`${thClass} text-right`}>Stávajících</th>
              <th className={`${thClass} text-right`}>Objednávek</th>
              <th className={`${thClass} text-right`}>Ø objednávka</th>
              <th className={`${thClass} text-right`}>Ø 1. nákup</th>
              <th className={`${thClass} text-right`}>Ø opakovaný</th>
              <th className={`${thClass} text-right`}>Ø dní mezi nákupy</th>
            </tr>
          </thead>
          <tbody>
            {yearCustomer.map((r, idx) => (
              <tr key={r.year} className={`border-b border-gray-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                <td className={`${tdClass} font-semibold text-slate-600`}>{r.year}</td>
                <td className={`${tdClass} text-right text-slate-700`}>{formatNumber(r.customers)}</td>
                <td className={`${tdClass} text-right text-emerald-700 font-medium`}>{formatNumber(r.newCustomers)}</td>
                <td className={`${tdClass} text-right text-blue-700 font-medium`}>{formatNumber(r.returningCustomers)}</td>
                <td className={`${tdClass} text-right text-slate-600`}>{formatNumber(r.orders)}</td>
                <td className={`${tdClass} text-right text-slate-600`}>{fc(r.avgOrderValue)}</td>
                <td className={`${tdClass} text-right text-slate-600`}>{r.avgFirstPurchase > 0 ? fc(r.avgFirstPurchase) : '—'}</td>
                <td className={`${tdClass} text-right text-slate-600`}>{r.avgRepeatPurchase > 0 ? fc(r.avgRepeatPurchase) : '—'}</td>
                <td className={`${tdClass} text-right text-slate-600`}>{r.avgDaysBetween > 0 ? `${Math.round(r.avgDaysBetween)} dní` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
              <td className={`${tdClass} text-blue-600 text-xs`}>Celkem</td>
              <td className={`${tdClass} text-right text-slate-800`}>{formatNumber(kpis.totalCustomers)}</td>
              <td className={`${tdClass} text-right text-emerald-700`}>{formatNumber(totalNewCustomers)}</td>
              <td className={`${tdClass} text-right text-blue-700`}>{formatNumber(totalReturning)}</td>
              <td className={`${tdClass} text-right text-slate-800`}>{formatNumber(totalOrders)}</td>
              <td className={`${tdClass} text-right text-slate-800`}>{fc(kpis.avgOrderValue)}</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
              <td className={`${tdClass} text-right text-slate-800`}>{kpis.avgDaysBetween > 0 ? `${Math.round(kpis.avgDaysBetween)} dní` : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </TableCard>

      {/* Retenční metriky */}
      <TableCard title="Retenční metriky (zákazníci)">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-b border-blue-800">
              <th className={`${thClass} text-left`}>Rok</th>
              <th className={`${thClass} text-right`}>Zákazníků</th>
              <th className={`${thClass} text-right`}>&gt; 1 nákup</th>
              <th className={`${thClass} text-right`}>&gt; 2 nákupy</th>
              <th className={`${thClass} text-right`}>&gt; 3 nákupy</th>
            </tr>
          </thead>
          <tbody>
            {yearRetention.map((r, idx) => (
              <tr key={r.year} className={`border-b border-gray-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                <td className={`${tdClass} font-semibold text-slate-600`}>{r.year}</td>
                <td className={`${tdClass} text-right text-slate-700`}>{formatNumber(r.customers)}</td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.rate1Plus)}</span></td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.rate2Plus)}</span></td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.rate3Plus)}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
              <td className={`${tdClass} text-blue-600 text-xs`}>Celkem</td>
              <td className={`${tdClass} text-right text-slate-800`}>{formatNumber(kpis.totalCustomers)}</td>
              <td className={`${tdClass} text-right`}><span className="inline-block bg-blue-200 text-blue-900 text-xs font-bold px-2 py-0.5 rounded-full">{fp(kpis.repeatPurchaseRate)}</span></td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
            </tr>
          </tfoot>
        </table>
      </TableCard>

      {/* Obratové metriky */}
      <TableCard title="Obratové metriky">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-b border-blue-800">
              <th className={`${thClass} text-left`}>Rok</th>
              <th className={`${thClass} text-right`}>Celkový obrat</th>
              <th className={`${thClass} text-right`}>Obrat &gt; 1 nákup</th>
              <th className={`${thClass} text-right`}>Obrat &gt; 2 nákupy</th>
              <th className={`${thClass} text-right`}>Obrat &gt; 3 nákupy</th>
            </tr>
          </thead>
          <tbody>
            {yearRevenue.map((r, idx) => (
              <tr key={r.year} className={`border-b border-gray-50 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                <td className={`${tdClass} font-semibold text-slate-600`}>{r.year}</td>
                <td className={`${tdClass} text-right text-slate-800 font-medium`}>{fc(r.totalRevenue)}</td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.revShare1Plus)}</span></td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.revShare2Plus)}</span></td>
                <td className={`${tdClass} text-right`}><span className="inline-block bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full">{fp(r.revShare3Plus)}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
              <td className={`${tdClass} text-blue-600 text-xs`}>Celkem</td>
              <td className={`${tdClass} text-right text-slate-800`}>{fc(totalRevAll)}</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
              <td className={`${tdClass} text-right text-slate-600`}>—</td>
            </tr>
          </tfoot>
        </table>
      </TableCard>
    </div>
  );
}
