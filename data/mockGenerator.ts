import { DailyRecord } from './types';
import { realDataAT } from './realDataAT';
import { realDataCZ } from './realDataCZ';
import { realDataSK } from './realDataSK';
import { realDataPL } from './realDataPL';
import { realDataNL } from './realDataNL';
import { realDataDE } from './realDataDE';

export const mockData: DailyRecord[] = [
  ...realDataAT.map(r => ({
    date: r.date,
    country: 'at' as const,
    currency: 'EUR' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
  ...realDataCZ.map(r => ({
    date: r.date,
    country: 'cz' as const,
    currency: 'CZK' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
  ...realDataSK.map(r => ({
    date: r.date,
    country: 'sk' as const,
    currency: 'EUR' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
  ...realDataPL.map(r => ({
    date: r.date,
    country: 'pl' as const,
    currency: 'PLN' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
  ...realDataNL.map(r => ({
    date: r.date,
    country: 'nl' as const,
    currency: 'EUR' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
  ...realDataDE.map(r => ({
    date: r.date,
    country: 'de' as const,
    currency: 'EUR' as const,
    orders: r.orders,
    orders_cancelled: r.orders_cancelled,
    revenue_vat: r.revenue_vat,
    revenue: r.revenue,
    cost: r.cost,
  })),
];

// Daily marketing data with per-channel breakdown
export interface DailyMarketingRow {
  date: string;
  cost: number;
  cost_facebook: number;
  cost_google: number;
  clicks_facebook: number;
  clicks_google: number;
  orders: number;
  revenue: number;
}

export function getDailyMarketingData(
  dateStart: string,
  dateEnd: string,
  _countries: string[],
): DailyMarketingRow[] {
  const byDate: Record<string, DailyMarketingRow> = {};

  for (const r of realDataAT.filter(d => d.date >= dateStart && d.date <= dateEnd)) {
    if (!byDate[r.date]) {
      byDate[r.date] = { date: r.date, cost: 0, cost_facebook: 0, cost_google: 0, clicks_facebook: 0, clicks_google: 0, orders: 0, revenue: 0 };
    }
    byDate[r.date].cost           += r.cost;
    byDate[r.date].cost_facebook  += r.cost_facebook;
    byDate[r.date].cost_google    += r.cost_google;
    byDate[r.date].clicks_facebook += r.clicks_facebook;
    byDate[r.date].clicks_google  += r.clicks_google;
    byDate[r.date].orders         += r.orders;
    byDate[r.date].revenue        += r.revenue;
  }

  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

// Source breakdown for marketing page
export interface MarketingSource {
  source: string;
  cost: number;
  currency: 'EUR';
  clicks: number;
  orders: number;
  revenue: number;
  pno: number;
  cpa: number;
}

export function getMarketingSourceData(
  dateStart: string,
  dateEnd: string,
  _countries: string[],
): MarketingSource[] {
  const r = realDataAT.filter(d => d.date >= dateStart && d.date <= dateEnd);
  const fbCost   = r.reduce((s, d) => s + d.cost_facebook, 0);
  const gCost    = r.reduce((s, d) => s + d.cost_google, 0);
  const fbClicks = r.reduce((s, d) => s + d.clicks_facebook, 0);
  const gClicks  = r.reduce((s, d) => s + d.clicks_google, 0);
  const totalRevenue = r.reduce((s, d) => s + d.revenue, 0);
  const totalOrders  = r.reduce((s, d) => s + d.orders, 0);

  const totalCost = fbCost + gCost;
  const mkShare = (c: number) => totalCost > 0 ? c / totalCost : 0;
  const safeDiv = (a: number, b: number) => b > 0 ? a / b : 0;

  return [
    {
      source: 'Facebook Ads', currency: 'EUR',
      cost: fbCost, clicks: fbClicks,
      orders:  Math.round(totalOrders  * mkShare(fbCost)),
      revenue: Math.round(totalRevenue * mkShare(fbCost)),
      pno: safeDiv(fbCost, totalRevenue * mkShare(fbCost)) * 100,
      cpa: safeDiv(fbCost, totalOrders  * mkShare(fbCost)),
    },
    {
      source: 'Google Ads', currency: 'EUR',
      cost: gCost, clicks: gClicks,
      orders:  Math.round(totalOrders  * mkShare(gCost)),
      revenue: Math.round(totalRevenue * mkShare(gCost)),
      pno: safeDiv(gCost, totalRevenue * mkShare(gCost)) * 100,
      cpa: safeDiv(gCost, totalOrders  * mkShare(gCost)),
    },
  ];
}
