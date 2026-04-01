'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { shippingPaymentDataCZ } from '@/data/shippingPaymentDataCZ';
import { shippingPaymentDataSK } from '@/data/shippingPaymentDataSK';
import { getDisplayCurrency } from '@/data/types';
import { formatCurrency, formatNumber, formatDate } from '@/lib/formatters';
import { Truck, CreditCard, DollarSign, Banknote, Star, Award, Gift, Save, RotateCcw } from 'lucide-react';

const LS_KEY = 'carrierCosts_v1';

interface CarrierCost {
  cz: string;  // CZK, prázdný řetězec = nevyplněno
  sk: string;  // EUR
  note: string;
}
import KpiCard from '@/components/kpi/KpiCard';
import { C } from '@/lib/chartColors';
import StatCard from '@/components/kpi/StatCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  TooltipProps,
} from 'recharts';

type Period = 'day' | 'week' | 'month';

const SHIP_PALETTE = [...C.palette];
const PAY_PALETTE  = [...C.palette].reverse();

function isoWeek(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().substring(0, 10);
}

function periodKey(date: string, p: Period): string {
  if (p === 'day')   return date;
  if (p === 'week')  return isoWeek(date);
  return date.substring(0, 7);
}

const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

function formatPeriodLabel(key: string, p: Period): string {
  if (p === 'month') {
    const [y, m] = key.split('-');
    return `${MONTHS_CS[parseInt(m) - 1]} ${y}`;
  }
  return key.substring(5);
}

interface MethodRow {
  name: string;
  count: number;
  revenue_vat: number;
  pct_count: number;
  pct_revenue: number;
  avg: number;
}

// Custom tooltip for stacked charts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StackedTooltip({ active, payload, label, fc }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = payload.reduce((s: number, p: any) => s + (p.value as number || 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-600 mb-2">{label}</p>
      {[...payload].reverse().map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-slate-600 truncate max-w-[110px]">{p.dataKey}</span>
          </span>
          <span className="font-semibold text-slate-800 whitespace-nowrap">{fc(p.value as number)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex justify-between font-semibold">
          <span className="text-slate-500">Celkem</span>
          <span className="text-slate-800">{fc(total)}</span>
        </div>
      )}
    </div>
  );
}

// Tooltip for % stacked charts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PctStackedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-600 mb-2">{label}</p>
      {[...payload].reverse().map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.fill }} />
            <span className="text-slate-600 truncate max-w-[110px]">{p.dataKey}</span>
          </span>
          <span className="font-semibold text-slate-800 whitespace-nowrap">{Number(p.value).toFixed(1)} %</span>
        </div>
      ))}
    </div>
  );
}

const RADIAN = Math.PI / 180;

// External label with leader line — name + %
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPieLabel({ cx, cy, midAngle, outerRadius, percent, name }: any) {
  if (percent < 0.04) return null;
  const sin  = Math.sin(-midAngle * RADIAN);
  const cos  = Math.cos(-midAngle * RADIAN);
  const mx   = cx + (outerRadius + 16) * cos;
  const my   = cy + (outerRadius + 16) * sin;
  const ex   = mx + (cos >= 0 ? 12 : -12);
  const ey   = my;
  const anchor = cos >= 0 ? 'start' : 'end';
  const label = name.length > 18 ? name.substring(0, 16) + '…' : name;
  return (
    <g>
      <path d={`M${cx + outerRadius * cos},${cy + outerRadius * sin}L${mx},${my}L${ex},${ey}`}
        stroke="#cbd5e1" fill="none" strokeWidth={1.2} />
      <circle cx={ex} cy={ey} r={2} fill="#94a3b8" />
      <text x={ex + (cos >= 0 ? 4 : -4)} y={ey - 5} textAnchor={anchor} fill="#374151" fontSize={10} fontWeight={600}>
        {label}
      </text>
      <text x={ex + (cos >= 0 ? 4 : -4)} y={ey + 7} textAnchor={anchor} fill="#94a3b8" fontSize={9}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
}

// Custom legend chips rendered as a div (outside PieChart)
function PieLegend({ rows, palette, total }: {
  rows: { name: string; count: number }[];
  palette: string[];
  total: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-4 justify-center">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-1.5 bg-slate-50 rounded-full px-3 py-1 text-xs border border-slate-100">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: palette[i % palette.length] }} />
          <span className="font-medium text-slate-700 max-w-[120px] truncate">{r.name}</span>
          <span className="text-slate-400 font-semibold">{total > 0 ? ((r.count / total) * 100).toFixed(1) : '0'}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ShippingPage() {
  const { filters, eurToCzk } = useFilters();
  const [period, setPeriod] = useState<Period>('day');

  const { start, end, prevStart, prevEnd } = getDateRange(filters);
  const startStr     = start.toISOString().split('T')[0];
  const endStr       = end.toISOString().split('T')[0];
  const prevStartStr = prevStart.toISOString().split('T')[0];
  const prevEndStr   = prevEnd.toISOString().split('T')[0];

  const currency = getDisplayCurrency(filters.countries);
  const onlySK   = filters.countries.length === 1 && filters.countries[0] === 'sk';
  const skMult   = onlySK ? 1 : eurToCzk;
  const fc = (v: number) => formatCurrency(v, currency);
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  // ── Merge CZ + SK ──────────────────────────────────────────────────────────
  const records = useMemo(() => {
    const out: { date: string; type: 'shipping' | 'payment'; name: string; count: number; revenue_vat: number }[] = [];
    if (filters.countries.includes('cz')) {
      for (const r of shippingPaymentDataCZ) {
        if (r.date < startStr || r.date > endStr) continue;
        out.push({ ...r });
      }
    }
    if (filters.countries.includes('sk')) {
      for (const r of shippingPaymentDataSK) {
        if (r.date < startStr || r.date > endStr) continue;
        out.push({ ...r, revenue_vat: r.revenue_vat * skMult });
      }
    }
    return out;
  }, [filters.countries, startStr, endStr, skMult]);

  const shipping = records.filter(r => r.type === 'shipping');
  const payment  = records.filter(r => r.type === 'payment');

  // ── Prev year records ──────────────────────────────────────────────────────
  const prevRecords = useMemo(() => {
    const out: { date: string; type: 'shipping' | 'payment'; name: string; count: number; revenue_vat: number }[] = [];
    if (filters.countries.includes('cz')) {
      for (const r of shippingPaymentDataCZ) {
        if (r.date < prevStartStr || r.date > prevEndStr) continue;
        out.push({ ...r });
      }
    }
    if (filters.countries.includes('sk')) {
      for (const r of shippingPaymentDataSK) {
        if (r.date < prevStartStr || r.date > prevEndStr) continue;
        out.push({ ...r, revenue_vat: r.revenue_vat * skMult });
      }
    }
    return out;
  }, [filters.countries, prevStartStr, prevEndStr, skMult]);

  const prevShipping = prevRecords.filter(r => r.type === 'shipping');
  const prevPayment  = prevRecords.filter(r => r.type === 'payment');
  const hasPrevData  = prevRecords.length > 0;

  function yoyPct(curr: number, prev: number): number {
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalShippingRev  = shipping.reduce((s, r) => s + r.revenue_vat, 0);
  const totalPaymentRev   = payment.reduce((s, r) => s + r.revenue_vat, 0);
  const totalShipCount    = shipping.reduce((s, r) => s + r.count, 0);
  const totalPayCount     = payment.reduce((s, r) => s + r.count, 0);
  const avgShipping       = totalShipCount > 0 ? totalShippingRev / totalShipCount : 0;
  const avgPayment        = totalPayCount  > 0 ? totalPaymentRev  / totalPayCount  : 0;
  // Free shipping = shipping records where revenue_vat === 0 (or name includes zdarma/free)
  const freeShippingCount = shipping
    .filter(r => r.revenue_vat === 0 || r.name.toLowerCase().includes('zdarma') || r.name.toLowerCase().includes('free'))
    .reduce((s, r) => s + r.count, 0);
  const freeShippingPct   = totalShipCount > 0 ? (freeShippingCount / totalShipCount) * 100 : 0;

  // Prev year KPIs
  const prevTotalShippingRev = prevShipping.reduce((s, r) => s + r.revenue_vat, 0);
  const prevTotalPaymentRev  = prevPayment.reduce((s, r) => s + r.revenue_vat, 0);
  const prevShipCount        = prevShipping.reduce((s, r) => s + r.count, 0);
  const prevPayCount         = prevPayment.reduce((s, r) => s + r.count, 0);
  const prevAvgShipping      = prevShipCount > 0 ? prevTotalShippingRev / prevShipCount : 0;
  const prevAvgPayment       = prevPayCount  > 0 ? prevTotalPaymentRev  / prevPayCount  : 0;
  const prevFreeCount        = prevShipping
    .filter(r => r.revenue_vat === 0 || r.name.toLowerCase().includes('zdarma') || r.name.toLowerCase().includes('free'))
    .reduce((s, r) => s + r.count, 0);
  const prevFreeShippingPct  = prevShipCount > 0 ? (prevFreeCount / prevShipCount) * 100 : 0;

  // Sparkline — daily totals for shipping and payment revenue
  const sparkShipping = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const r of shipping) byDate[r.date] = (byDate[r.date] || 0) + r.revenue_vat;
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [shipping]);
  const sparkPayment = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const r of payment) byDate[r.date] = (byDate[r.date] || 0) + r.revenue_vat;
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [payment]);

  // ── Method breakdown ───────────────────────────────────────────────────────
  function methodRows(data: typeof shipping): MethodRow[] {
    const byName: Record<string, { count: number; revenue_vat: number }> = {};
    for (const r of data) {
      if (!byName[r.name]) byName[r.name] = { count: 0, revenue_vat: 0 };
      byName[r.name].count       += r.count;
      byName[r.name].revenue_vat += r.revenue_vat;
    }
    const totalRev   = Object.values(byName).reduce((s, r) => s + r.revenue_vat, 0);
    const totalCount = Object.values(byName).reduce((s, r) => s + r.count, 0);
    return Object.entries(byName)
      .map(([name, v]) => ({
        name,
        count:       v.count,
        revenue_vat: v.revenue_vat,
        pct_count:   totalCount > 0 ? (v.count / totalCount) * 100 : 0,
        pct_revenue: totalRev   > 0 ? (v.revenue_vat / totalRev) * 100 : 0,
        avg:         v.count    > 0 ? v.revenue_vat / v.count : 0,
      }))
      .sort((a, b) => b.revenue_vat - a.revenue_vat);
  }

  const shippingRows = useMemo(() => methodRows(shipping), [shipping]);
  const paymentRows  = useMemo(() => methodRows(payment),  [payment]);

  // ── Trend data — % stacked per method (by count) ──────────────────────────
  function buildPctTrendData(data: typeof shipping, palette: string[]) {
    const methods = [...new Set(data.map(r => r.name))].sort();
    const countMap: Record<string, Record<string, number>> = {};
    for (const r of data) {
      const key = periodKey(r.date, period);
      if (!countMap[key]) countMap[key] = {};
      countMap[key][r.name] = (countMap[key][r.name] || 0) + r.count;
    }
    const chartData = Object.entries(countMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => {
        const total = Object.values(vals).reduce((s, v) => s + v, 0);
        return {
          label: formatPeriodLabel(key, period),
          ...Object.fromEntries(methods.map(m => [
            m,
            total > 0 ? Math.round((vals[m] || 0) / total * 1000) / 10 : 0,
          ])),
        };
      });
    const colorMap = Object.fromEntries(methods.map((m, i) => [m, palette[i % palette.length]]));
    return { chartData, methods, colorMap };
  }

  const shipTrend = useMemo(() => buildPctTrendData(shipping, SHIP_PALETTE), [shipping, period]);
  const payTrend  = useMemo(() => buildPctTrendData(payment,  PAY_PALETTE),  [payment,  period]);

  // ── Pie data ───────────────────────────────────────────────────────────────
  const shipPieData = shippingRows.map(r => ({ name: r.name, value: r.count }));
  const payPieData  = paymentRows.map(r => ({ name: r.name, value: r.count }));

  const barSize = period === 'month' ? 28 : period === 'week' ? 14 : 6;
  const noData  = records.length === 0;

  // ── Carrier cost table ─────────────────────────────────────────────────────
  const allCarriers = useMemo(() => {
    const czNames = new Set(shippingPaymentDataCZ.filter(r => r.type === 'shipping').map(r => r.name));
    const skNames = new Set(shippingPaymentDataSK.filter(r => r.type === 'shipping').map(r => r.name));
    return [...new Set([...czNames, ...skNames])].sort();
  }, []);

  const [costs, setCosts] = useState<Record<string, CarrierCost>>({});
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCosts(JSON.parse(raw));
    } catch {}
  }, []);

  // E-shop shipping cost = sum(count * pricePerCarrier) for the current period
  const eshopShippingCost = useMemo(() => {
    let total = 0;
    if (filters.countries.includes('cz')) {
      for (const r of shippingPaymentDataCZ) {
        if (r.type !== 'shipping' || r.date < startStr || r.date > endStr) continue;
        const price = Number(costs[r.name]?.cz) || 0;
        total += r.count * price;
      }
    }
    if (filters.countries.includes('sk')) {
      for (const r of shippingPaymentDataSK) {
        if (r.type !== 'shipping' || r.date < startStr || r.date > endStr) continue;
        const price = Number(costs[r.name]?.sk) || 0;
        total += r.count * price * skMult;
      }
    }
    return total;
  }, [costs, filters.countries, startStr, endStr, skMult]);

  const shippingProfitLoss = totalShippingRev - eshopShippingCost;
  const hasAnyCost = Object.values(costs).some(c => Number(c.cz) > 0 || Number(c.sk) > 0);

  // Per-carrier profit/loss table
  const carrierPnl = useMemo(() => {
    // Build per-carrier CZ/SK counts for current period
    const czCount: Record<string, number> = {};
    const skCount: Record<string, number> = {};
    if (filters.countries.includes('cz')) {
      for (const r of shippingPaymentDataCZ) {
        if (r.type !== 'shipping' || r.date < startStr || r.date > endStr) continue;
        czCount[r.name] = (czCount[r.name] || 0) + r.count;
      }
    }
    if (filters.countries.includes('sk')) {
      for (const r of shippingPaymentDataSK) {
        if (r.type !== 'shipping' || r.date < startStr || r.date > endStr) continue;
        skCount[r.name] = (skCount[r.name] || 0) + r.count;
      }
    }
    // Merge all carrier names
    const names = [...new Set([...Object.keys(czCount), ...Object.keys(skCount)])];
    return names.map(name => {
      const customerPays = shippingRows.find(r => r.name === name)?.revenue_vat ?? 0;
      const count        = shippingRows.find(r => r.name === name)?.count ?? 0;
      const eshopPays    = (czCount[name] || 0) * (Number(costs[name]?.cz) || 0)
                         + (skCount[name] || 0) * (Number(costs[name]?.sk) || 0) * skMult;
      const pnl = customerPays - eshopPays;
      return { name, count, customerPays, eshopPays, pnl };
    }).sort((a, b) => b.count - a.count);
  }, [costs, filters.countries, startStr, endStr, skMult, shippingRows]);

  function updateCost(name: string, field: keyof CarrierCost, value: string) {
    setCosts(prev => { const cur = Object.assign({ cz: '', sk: '', note: '' }, prev[name], { [field]: value }); return { ...prev, [name]: cur as CarrierCost }; });
    setSaved(false);
  }

  function saveCosts() {
    localStorage.setItem(LS_KEY, JSON.stringify(costs));
    setSaved(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 2500);
  }

  function resetCosts() {
    if (!confirm('Opravdu vymazat všechny ceny dopravců?')) return;
    setCosts({});
    localStorage.removeItem(LS_KEY);
    setSaved(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Doprava a platba</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle} · co zákazníci zaplatili</p>
      </div>

      {noData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700">
          Žádná data. Spusťte <code className="font-mono bg-amber-100 px-1 rounded">node scripts/updateData.js</code>.
        </div>
      )}

      {/* KPI boxes — Doprava */}
      <div>
        <p className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Truck size={16} /> Doprava
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <KpiCard title="Doprava zákazník"     value={fc(totalShippingRev)}                          yoy={yoyPct(totalShippingRev, prevTotalShippingRev)} icon={<Truck size={16} />}      sparklineData={sparkShipping} hasPrevData={hasPrevData} />
          <KpiCard title="Doprava e-shop"       value={hasAnyCost ? fc(eshopShippingCost) : '--'}     yoy={0}                                               icon={<DollarSign size={16} />} sparklineData={[]}            hasPrevData={false} />
          <KpiCard
            title="Doprava zisk / ztráta"
            value={hasAnyCost ? fc(shippingProfitLoss) : '--'}
            yoy={0}
            icon={<DollarSign size={16} />}
            sparklineData={[]}
            hasPrevData={false}
            variant={!hasAnyCost ? 'default' : shippingProfitLoss >= 0 ? 'green' : 'red'}
          />
          <KpiCard title="Prům. doprava"        value={fc(avgShipping)}                               yoy={yoyPct(avgShipping, prevAvgShipping)}            icon={<DollarSign size={16} />} sparklineData={[]}            hasPrevData={hasPrevData} />
          <KpiCard title="Doprava zdarma"       value={formatNumber(freeShippingCount)}               yoy={yoyPct(freeShippingPct, prevFreeShippingPct)}   icon={<Gift size={16} />}       sparklineData={[]}            hasPrevData={hasPrevData} />
        </div>
      </div>

      {/* KPI boxes — Platba */}
      <div>
        <p className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <CreditCard size={16} /> Platba
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <KpiCard title="Platby celkem"        value={fc(totalPaymentRev)}                           yoy={yoyPct(totalPaymentRev, prevTotalPaymentRev)}   icon={<CreditCard size={16} />} sparklineData={sparkPayment}  hasPrevData={hasPrevData} />
          <KpiCard title="Prům. platba"         value={fc(avgPayment)}                                yoy={yoyPct(avgPayment, prevAvgPayment)}              icon={<Banknote size={16} />}   sparklineData={[]}            hasPrevData={hasPrevData} />
        </div>
      </div>

      {/* Carrier P&L table */}
      {hasAnyCost && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Zisk / Ztráta dopravce</h2>
            <p className="text-xs text-slate-400 mt-0.5">Doprava zákazník minus reálné náklady e-shopu</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Dopravce</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Obj.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Zákazník platí</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">E-shop platí</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Zisk / ztráta</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Na objednávku</th>
                </tr>
              </thead>
              <tbody>
                {carrierPnl.map((r, i) => (
                  <tr key={r.name} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(r.count)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fc(r.customerPays)}</td>
                    <td className={`px-4 py-2.5 text-right ${r.eshopPays > 0 ? 'text-slate-600' : 'text-slate-300'}`}>{r.eshopPays > 0 ? fc(r.eshopPays) : '--'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${r.eshopPays === 0 ? 'text-slate-300' : r.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {r.eshopPays === 0 ? '--' : (r.pnl >= 0 ? '+' : '') + fc(r.pnl)}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-xs ${r.eshopPays === 0 ? 'text-slate-300' : r.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {r.eshopPays === 0 || r.count === 0 ? '--' : (r.pnl >= 0 ? '+' : '') + fc(r.pnl / r.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-100 font-semibold">
                  <td className="px-4 py-3 text-blue-600 text-xs">Celkem</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{formatNumber(totalShipCount)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fc(totalShippingRev)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fc(eshopShippingCost)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${shippingProfitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {(shippingProfitLoss >= 0 ? '+' : '') + fc(shippingProfitLoss)}
                  </td>
                  <td className={`px-4 py-3 text-right text-xs ${shippingProfitLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {totalShipCount > 0 ? (shippingProfitLoss >= 0 ? '+' : '') + fc(shippingProfitLoss / totalShipCount) : '--'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Period toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Zobrazit po:</span>
        {(['day', 'week', 'month'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              period === p ? 'bg-blue-800 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {p === 'day' ? 'Den' : p === 'week' ? 'Týden' : 'Měsíc'}
          </button>
        ))}
      </div>

      {/* Shipping trend chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Vývoj využitelnosti dopravců</h2>
        <p className="text-xs text-slate-400 mb-4">% rozložení objednávek dle dopravce v čase</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={shipTrend.chartData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => `${v} %`}
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={48}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<PctStackedTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {shipTrend.methods.map(m => (
              <Bar key={m} dataKey={m} stackId="ship" fill={shipTrend.colorMap[m]} barSize={barSize} radius={m === shipTrend.methods[shipTrend.methods.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Payment trend chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Vývoj využitelnosti plateb</h2>
        <p className="text-xs text-slate-400 mb-4">% rozložení objednávek dle způsobu platby v čase</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={payTrend.chartData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => `${v} %`}
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={48}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<PctStackedTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {payTrend.methods.map(m => (
              <Bar key={m} dataKey={m} stackId="pay" fill={payTrend.colorMap[m]} barSize={barSize} radius={m === payTrend.methods[payTrend.methods.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>


      {/* Donut + table grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Shipping breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Způsoby doručení — rozložení</h2>
            <p className="text-xs text-slate-400 mt-0.5">% podíl objednávek dle dopravce</p>
          </div>

          {shipPieData.length > 0 && (
            <>
              <div className="px-2 pt-4 pb-1">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                    <Pie
                      data={shipPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={3}
                      labelLine={false}
                      label={renderPieLabel}
                    >
                      {shipPieData.map((_, i) => (
                        <Cell key={i} fill={SHIP_PALETTE[i % SHIP_PALETTE.length]} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatNumber(Number(v)), 'Počet objednávek']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <PieLegend rows={shippingRows} palette={SHIP_PALETTE} total={totalShipCount} />
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Dopravce</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Obj.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">% obj.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Zákazníci zaplatili</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Průměr</th>
                </tr>
              </thead>
              <tbody>
                {shippingRows.map((r, i) => (
                  <tr key={r.name} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 text-slate-700 font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SHIP_PALETTE[i % SHIP_PALETTE.length] }} />
                      {r.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(r.count)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{r.pct_count.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fc(r.revenue_vat)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{fc(r.avg)}</td>
                  </tr>
                ))}
                {shippingRows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Žádná data</td></tr>
                )}
              </tbody>
              {shippingRows.length > 0 && (
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-100 font-semibold">
                    <td className="px-4 py-3 text-blue-600 text-xs">Celkem</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{formatNumber(totalShipCount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">100%</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fc(totalShippingRev)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fc(avgShipping)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Způsoby platby — rozložení</h2>
            <p className="text-xs text-slate-400 mt-0.5">% podíl objednávek dle způsobu platby</p>
          </div>

          {payPieData.length > 0 && (
            <>
              <div className="px-2 pt-4 pb-1">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                    <Pie
                      data={payPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={3}
                      labelLine={false}
                      label={renderPieLabel}
                    >
                      {payPieData.map((_, i) => (
                        <Cell key={i} fill={PAY_PALETTE[i % PAY_PALETTE.length]} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatNumber(Number(v)), 'Počet objednávek']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <PieLegend rows={paymentRows} palette={PAY_PALETTE} total={totalPayCount} />
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Platební metoda</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Obj.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">% obj.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Zákazníci zaplatili</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Průměr</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((r, i) => (
                  <tr key={r.name} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 text-slate-700 font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PAY_PALETTE[i % PAY_PALETTE.length] }} />
                      {r.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatNumber(r.count)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{r.pct_count.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fc(r.revenue_vat)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{fc(r.avg)}</td>
                  </tr>
                ))}
                {paymentRows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Žádná data</td></tr>
                )}
              </tbody>
              {paymentRows.length > 0 && (
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-100 font-semibold">
                    <td className="px-4 py-3 text-blue-600 text-xs">Celkem</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{formatNumber(totalPayCount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">100%</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fc(totalPaymentRev)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fc(avgPayment)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>

      {/* Carrier cost tables */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Ceník dopravců</h2>
            <p className="text-xs text-slate-400 mt-0.5">Reálné náklady, které platíme za dopravu</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-600 font-medium">✓ Uloženo</span>}
            <button onClick={resetCosts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors">
              <RotateCcw size={13} /> Resetovat
            </button>
            <button onClick={saveCosts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 transition-colors">
              <Save size={13} /> Uložit
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 divide-y divide-slate-100 ${filters.countries.includes('cz') && filters.countries.includes('sk') ? 'xl:grid-cols-2 xl:divide-y-0 xl:divide-x' : ''}`}>

          {/* CZ */}
          {filters.countries.includes('cz') && <div>
            <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
              <span className="text-sm">🇨🇿</span>
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Česká republika — ceny v Kč</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Dopravce</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Cena (Kč)</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {allCarriers.filter(n => shippingPaymentDataCZ.some(r => r.type === 'shipping' && r.name === n)).map((name, idx) => {
                  const c = costs[name] ?? { cz: '', sk: '', note: '' };
                  return (
                    <tr key={name} className={`border-b border-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{name}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end">
                          <div className="relative">
                            <input type="number" min="0" step="0.01" value={c.cz} onChange={e => updateCost(name, 'cz', e.target.value)} placeholder="0.00"
                              className="w-28 text-right text-sm tabular-nums pr-8 pl-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">Kč</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={c.note} onChange={e => updateCost(name, 'note', e.target.value)} placeholder="poznámka..."
                          className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-600 placeholder:text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}

          {/* SK */}
          {filters.countries.includes('sk') && <div>
            <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <span className="text-sm">🇸🇰</span>
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Slovensko — ceny v €</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Dopravce</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-white uppercase tracking-wider">Cena (€)</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white uppercase tracking-wider">Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {allCarriers.filter(n => shippingPaymentDataSK.some(r => r.type === 'shipping' && r.name === n)).map((name, idx) => {
                  const c = costs[name] ?? { cz: '', sk: '', note: '' };
                  return (
                    <tr key={name} className={`border-b border-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{name}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end">
                          <div className="relative">
                            <input type="number" min="0" step="0.01" value={c.sk} onChange={e => updateCost(name, 'sk', e.target.value)} placeholder="0.00"
                              className="w-24 text-right text-sm tabular-nums pr-6 pl-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">€</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={c.note} onChange={e => updateCost(name, 'note', e.target.value)} placeholder="poznámka..."
                          className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-600 placeholder:text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}

        </div>
        <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-400">
          Data se ukládají lokálně v prohlížeči (localStorage). Klikněte na <strong className="text-slate-500">Uložit</strong> pro potvrzení.
        </div>
      </div>

    </div>
  );
}
