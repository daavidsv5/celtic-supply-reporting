'use client';

import { useMemo } from 'react';
import { DailyRecord, FilterState, KpiData, EUR_TO_CZK, getDisplayCurrency, Currency } from '@/data/types';
// EUR_TO_CZK is used as default fallback only
import { getDateRange } from './useFilters';

export interface ChartDataPoint {
  date: string;
  revenue: number;
  revenue_prev: number;
  orders: number;
  orders_prev: number;
  cost: number;
  cost_prev: number;
  pno: number;
  pno_prev: number;
  aov: number;
  aov_prev: number;
  cpa: number;
  cpa_prev: number;
}

export interface DashboardData {
  currentData: DailyRecord[];
  prevData: DailyRecord[];
  kpi: KpiData;
  prevKpi: KpiData;
  yoy: Record<keyof KpiData, number>;
  chartData: ChartDataPoint[];
  currency: Currency;
  /** False when no previous-year data exists (e.g. CZ launched May 2025) */
  hasPrevData: boolean;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize a record's monetary values to the display currency.
 *  - displayCurrency = 'EUR'  → keep EUR as-is, ignore CZK records (shouldn't exist)
 *  - displayCurrency = 'CZK'  → keep CZK as-is, convert EUR records × eurToCzk
 */
function normalizedValues(r: DailyRecord, displayCurrency: Currency, eurToCzk: number) {
  const multiplier =
    displayCurrency === 'CZK' && r.currency === 'EUR' ? eurToCzk : 1;
  return {
    revenue:     r.revenue     * multiplier,
    revenue_vat: r.revenue_vat * multiplier,
    cost:        r.cost        * multiplier,
    orders:      r.orders,
  };
}

function calcKpi(records: DailyRecord[], displayCurrency: Currency, eurToCzk: number): KpiData {
  let revenuevat = 0, revenue = 0, orders = 0, ordersCancelled = 0, cost = 0;
  for (const r of records) {
    const v = normalizedValues(r, displayCurrency, eurToCzk);
    revenuevat      += v.revenue_vat;
    revenue         += v.revenue;
    orders          += v.orders;
    ordersCancelled += r.orders_cancelled;
    cost            += v.cost;
  }
  const aov        = orders > 0 ? revenuevat / orders : 0;
  const pno        = revenue > 0 ? (cost / revenue) * 100 : 0;
  const cpa        = orders > 0 ? cost / orders : 0;
  const totalWithCancelled = orders + ordersCancelled;
  const cancelRate = totalWithCancelled > 0 ? (ordersCancelled / totalWithCancelled) * 100 : 0;
  return { revenuevat, revenue, orders, aov, cost, pno, cpa, ordersCancelled, cancelRate };
}

function yoyChange(current: number, prev: number): number {
  if (prev === 0) return 0;
  return ((current - prev) / prev) * 100;
}

export function useDashboardData(
  filters: FilterState,
  allData: DailyRecord[],
  eurToCzk: number = EUR_TO_CZK
): DashboardData {
  return useMemo(() => {
    const { start, end, prevStart, prevEnd } = getDateRange(filters);
    const startStr    = isoDate(start);
    const endStr      = isoDate(end);
    const prevStartStr = isoDate(prevStart);
    const prevEndStr  = isoDate(prevEnd);

    const currency = getDisplayCurrency(filters.countries);

    const currentData = allData.filter(
      r => r.date >= startStr && r.date <= endStr && filters.countries.includes(r.country)
    );
    const prevData = allData.filter(
      r => r.date >= prevStartStr && r.date <= prevEndStr && filters.countries.includes(r.country)
    );

    const kpi     = calcKpi(currentData, currency, eurToCzk);
    const prevKpi = calcKpi(prevData,    currency, eurToCzk);

    const yoy: Record<keyof KpiData, number> = {
      revenuevat:       yoyChange(kpi.revenuevat,       prevKpi.revenuevat),
      revenue:          yoyChange(kpi.revenue,          prevKpi.revenue),
      orders:           yoyChange(kpi.orders,           prevKpi.orders),
      aov:              yoyChange(kpi.aov,              prevKpi.aov),
      cost:             yoyChange(kpi.cost,             prevKpi.cost),
      pno:              yoyChange(kpi.pno,              prevKpi.pno),
      cpa:              yoyChange(kpi.cpa,              prevKpi.cpa),
      ordersCancelled:  yoyChange(kpi.ordersCancelled,  prevKpi.ordersCancelled),
      cancelRate:       yoyChange(kpi.cancelRate,       prevKpi.cancelRate),
    };

    // Chart data — aggregate current period by date
    const currentByDate: Record<string, { revenue: number; orders: number; cost: number }> = {};
    for (const r of currentData) {
      const v = normalizedValues(r, currency, eurToCzk);
      if (!currentByDate[r.date]) currentByDate[r.date] = { revenue: 0, orders: 0, cost: 0 };
      currentByDate[r.date].revenue += v.revenue;
      currentByDate[r.date].orders  += v.orders;
      currentByDate[r.date].cost    += v.cost;
    }

    // Previous period shifted +1 year to align with current dates
    const prevByShiftedDate: Record<string, { revenue: number; orders: number; cost: number }> = {};
    for (const r of prevData) {
      const v = normalizedValues(r, currency, eurToCzk);
      const d = new Date(r.date);
      d.setFullYear(d.getFullYear() + 1);
      const shifted = isoDate(d);
      if (!prevByShiftedDate[shifted]) prevByShiftedDate[shifted] = { revenue: 0, orders: 0, cost: 0 };
      prevByShiftedDate[shifted].revenue += v.revenue;
      prevByShiftedDate[shifted].orders  += v.orders;
      prevByShiftedDate[shifted].cost    += v.cost;
    }

    const chartData: ChartDataPoint[] = Object.keys(currentByDate).sort().map(date => {
      const cur  = currentByDate[date];
      const prev = prevByShiftedDate[date] ?? { revenue: 0, orders: 0, cost: 0 };
      return {
        date,
        revenue:      cur.revenue,
        revenue_prev: prev.revenue,
        orders:       cur.orders,
        orders_prev:  prev.orders,
        cost:         cur.cost,
        cost_prev:    prev.cost,
        pno:      cur.revenue  > 0 ? Math.round(cur.cost  / cur.revenue  * 10000) / 100 : 0,
        pno_prev: prev.revenue > 0 ? Math.round(prev.cost / prev.revenue * 10000) / 100 : 0,
        aov:      cur.orders  > 0 ? cur.revenue  / cur.orders  : 0,
        aov_prev: prev.orders > 0 ? prev.revenue / prev.orders : 0,
        cpa:      cur.orders  > 0 ? cur.cost  / cur.orders  : 0,
        cpa_prev: prev.orders > 0 ? prev.cost / prev.orders : 0,
      };
    });

    const hasPrevData = prevData.some(r => r.orders > 0 || r.revenue > 0);

    return { currentData, prevData, kpi, prevKpi, yoy, chartData, currency, hasPrevData };
  }, [filters, allData, eurToCzk]);
}
