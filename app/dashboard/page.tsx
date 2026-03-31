'use client';

import { useMemo } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import { mockData } from '@/data/mockGenerator';
import { marginDataCZ } from '@/data/marginDataCZ';
import { marginDataSK } from '@/data/marginDataSK';
import { retentionDataCZ } from '@/data/retentionDataCZ';
import { retentionDataSK } from '@/data/retentionDataSK';
import KpiCard from '@/components/kpi/KpiCard';
import RevenueOrdersChart from '@/components/charts/RevenueOrdersChart';
import CostPnoChart from '@/components/charts/CostPnoChart';
import DailyTable from '@/components/tables/DailyTable';
import CountryDistribution from '@/components/tables/CountryDistribution';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/formatters';
import { Wallet, Banknote, ShoppingCart, BarChart2, TrendingUp, Percent, Tag, Users } from 'lucide-react';

const periodTitles: Record<string, string> = {
  current_year: 'tento rok',
  current_month: 'tento měsíc',
  last_14_days: 'posledních 14 dní',
  custom: 'vlastní období',
};

export default function DashboardPage() {
  const { filters, eurToCzk } = useFilters();
  const { kpi, prevKpi, yoy, chartData, currentData, currency, hasPrevData } = useDashboardData(filters, mockData, eurToCzk);

  const { start, end, prevStart, prevEnd } = getDateRange(filters);

  const isSKOnly = filters.countries.length === 1 && filters.countries[0] === 'sk';
  const skMult = isSKOnly ? 1 : eurToCzk;

  // Merge margin data for selected countries (current + prev period)
  const marginTotals = useMemo(() => {
    const s  = start.toISOString().split('T')[0];
    const e  = end.toISOString().split('T')[0];
    const ps = prevStart.toISOString().split('T')[0];
    const pe = prevEnd.toISOString().split('T')[0];
    let pc = 0, mr = 0, prevPc = 0, prevMr = 0;
    const marginData: { date: string; purchaseCost: number }[] = [];
    if (filters.countries.includes('cz')) {
      for (const r of marginDataCZ) {
        if (r.date >= s && r.date <= e)  { pc += r.purchaseCost; mr += r.revenue; marginData.push({ date: r.date, purchaseCost: r.purchaseCost }); }
        if (r.date >= ps && r.date <= pe){ prevPc += r.purchaseCost; prevMr += r.revenue; }
      }
    }
    if (filters.countries.includes('sk')) {
      for (const r of marginDataSK) {
        if (r.date >= s && r.date <= e)  { pc += r.purchaseCost * skMult; mr += r.revenue * skMult; marginData.push({ date: r.date, purchaseCost: r.purchaseCost * skMult }); }
        if (r.date >= ps && r.date <= pe){ prevPc += r.purchaseCost * skMult; prevMr += r.revenue * skMult; }
      }
    }
    return { marginData, purchaseCost: pc, marginRev: mr, prevPurchaseCost: prevPc, prevMarginRev: prevMr };
  }, [filters.countries, start, end, prevStart, prevEnd, skMult]);

  const newCustomerCounts = useMemo(() => {
    const s  = start.toISOString().split('T')[0];
    const e  = end.toISOString().split('T')[0];
    const ps = prevStart.toISOString().split('T')[0];
    const pe = prevEnd.toISOString().split('T')[0];
    let cur = 0, prev = 0, allCur = 0, allPrev = 0;
    const sources = [
      ...(filters.countries.includes('cz') ? retentionDataCZ : []),
      ...(filters.countries.includes('sk') ? retentionDataSK : []),
    ];
    for (const c of sources) {
      const first = c.dates[0];
      if (first >= s  && first <= e)  cur++;
      if (first >= ps && first <= pe) prev++;
      if (c.dates.some(d => d >= s  && d <= e))  allCur++;
      if (c.dates.some(d => d >= ps && d <= pe)) allPrev++;
    }
    return { cur, prev, allCur, allPrev };
  }, [filters.countries, start, end, prevStart, prevEnd]);

  const { marginData, marginRev, purchaseCost, prevMarginRev, prevPurchaseCost } = marginTotals;
  const margin        = marginRev - purchaseCost;
  const marginPct     = marginRev > 0 ? (margin / marginRev) * 100 : 0;
  const grossProfit   = margin - kpi.cost;
  const grossPct      = marginRev > 0 ? (grossProfit / marginRev) * 100 : 0;
  const prevMargin      = prevMarginRev - prevPurchaseCost;
  const prevMarginPct   = prevMarginRev > 0 ? (prevMargin / prevMarginRev) * 100 : 0;
  const prevGrossProfit = prevMargin - (prevKpi?.cost ?? 0);
  const prevGrossPct    = prevMarginRev > 0 ? (prevGrossProfit / prevMarginRev) * 100 : 0;
  const yoyMargin      = hasPrevData && prevMargin !== 0     ? ((margin - prevMargin) / Math.abs(prevMargin)) * 100             : null;
  const yoyMarginPct   = hasPrevData && prevMarginPct !== 0  ? ((marginPct - prevMarginPct) / Math.abs(prevMarginPct)) * 100    : null;
  const yoyGrossProfit = hasPrevData && prevGrossProfit !== 0 ? ((grossProfit - prevGrossProfit) / Math.abs(prevGrossProfit)) * 100 : null;
  const yoyGrossPct    = hasPrevData && prevGrossPct !== 0    ? ((grossPct - prevGrossPct) / Math.abs(prevGrossPct)) * 100      : null;

  const costPerNewCustomer     = newCustomerCounts.cur  > 0 ? kpi.cost / newCustomerCounts.cur  : 0;
  const prevCostPerNewCustomer = newCustomerCounts.prev > 0 ? (prevKpi?.cost ?? 0) / newCustomerCounts.prev : 0;
  const yoyCostPerNewCustomer  = hasPrevData && prevCostPerNewCustomer !== 0
    ? ((costPerNewCustomer - prevCostPerNewCustomer) / prevCostPerNewCustomer) * 100 : null;

  const grossPerOrder        = kpi.orders > 0 ? grossProfit / kpi.orders : 0;
  const prevGrossPerOrder    = (prevKpi?.orders ?? 0) > 0 ? prevGrossProfit / (prevKpi?.orders ?? 0) : 0;
  const yoyGrossPerOrder     = hasPrevData && prevGrossPerOrder !== 0
    ? ((grossPerOrder - prevGrossPerOrder) / Math.abs(prevGrossPerOrder)) * 100 : null;

  const grossPerNewCustomer     = newCustomerCounts.cur  > 0 ? grossProfit / newCustomerCounts.cur  : 0;
  const prevGrossPerNewCustomer = newCustomerCounts.prev > 0 ? prevGrossProfit / newCustomerCounts.prev : 0;
  const yoyGrossPerNewCustomer  = hasPrevData && prevGrossPerNewCustomer !== 0
    ? ((grossPerNewCustomer - prevGrossPerNewCustomer) / Math.abs(prevGrossPerNewCustomer)) * 100 : null;
  const title = `KPI – ${periodTitles[filters.timePeriod] ?? 'aktuální období'} (YoY)`;
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  // Sparkline: daily revenue series for current period
  const dailyRevenue = chartData.map((d) => d.revenue);
  const dailyOrders = chartData.map((d) => d.orders);
  const dailyCost = chartData.map((d) => d.cost);
  const dailyPno = chartData.map((d) => d.pno);
  const dailyAov = chartData.map((d) => (d.orders > 0 ? d.revenue / d.orders : 0));
  const dailyCpa = chartData.map((d) => (d.orders > 0 ? d.cost / d.orders : 0));

  const fc = (v: number) => formatCurrency(v, currency);

  const kpiCards = [
    { title: 'Tržby s DPH',            value: fc(kpi.revenuevat), yoy: yoy.revenuevat, icon: <Wallet size={16} /> },
    { title: 'Tržby bez DPH',          value: fc(kpi.revenue),    yoy: yoy.revenue,    icon: <Banknote size={16} /> },
    { title: 'Počet objednávek',        value: formatNumber(kpi.orders), yoy: yoy.orders, icon: <ShoppingCart size={16} /> },
    { title: 'AOV',                     value: fc(kpi.aov),        yoy: yoy.aov,        icon: <BarChart2 size={16} /> },
    { title: 'Marketingové investice',  value: fc(kpi.cost),       yoy: yoy.cost,       icon: <TrendingUp size={16} />,  invertColors: true },
    { title: 'PNO (%)',                 value: formatPercent(kpi.pno), yoy: yoy.pno,    icon: <Percent size={16} />,     invertColors: true },
    { title: 'Cena za objednávku',      value: fc(kpi.cpa),        yoy: yoy.cpa,        icon: <Tag size={16} />,         invertColors: true },
    { title: 'Marže',                   value: fc(margin),            yoy: yoyMargin,      icon: <Banknote size={16} /> },
    { title: 'Marže %',                 value: formatPercent(marginPct),       yoy: yoyMarginPct,   icon: <Percent size={16} /> },
    { title: 'Cena za nového zákazníka', value: newCustomerCounts.cur > 0 ? fc(costPerNewCustomer) : '–', yoy: yoyCostPerNewCustomer, icon: <Users size={16} />, invertColors: true },
    { title: 'Hrubý zisk na objednávku', value: kpi.orders > 0 ? fc(grossPerOrder) : '–', yoy: yoyGrossPerOrder, icon: <Banknote size={16} /> },
  ].map(c => ({ ...c, hasPrevData }));

  const grossKpiCards = [
    { title: 'Hrubý zisk',   value: fc(grossProfit),         yoy: yoyGrossProfit, icon: <TrendingUp size={16} />, variant: 'green' as const, hasPrevData },
    { title: 'Hrubý zisk %', value: formatPercent(grossPct), yoy: yoyGrossPct,    icon: <BarChart2 size={16} />,  variant: 'green' as const, hasPrevData },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>

      {/* Hrubý zisk — vlastní řádek */}
      <div className="grid grid-cols-2 gap-4">
        {grossKpiCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>

      {/* Country Distribution */}
      {filters.countries.length > 1 && (
        <CountryDistribution data={currentData} eurToCzk={eurToCzk} />
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RevenueOrdersChart data={chartData} currency={currency} hasPrevData={hasPrevData} />
        <CostPnoChart data={chartData} currency={currency} hasPrevData={hasPrevData} />
      </div>

      {/* Table */}
      <DailyTable data={currentData} eurToCzk={eurToCzk} marginData={marginData} />
    </div>
  );
}
