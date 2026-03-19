import { CustomerRetentionRecord } from '@/data/retentionGenerator';

export interface RetentionKpis {
  totalCustomers: number;
  totalRevenue: number;
  avgOrderValue: number;
  repeatPurchaseRate: number;
  avgDaysBetween: number;
  ltvPerCustomer: number;
}

export interface YearCustomerMetrics {
  year: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  orders: number;
  avgOrderValue: number;
  avgFirstPurchase: number;
  avgRepeatPurchase: number;
  avgDaysBetween: number;
}

export interface YearRetentionMetrics {
  year: number;
  customers: number;
  rate1Plus: number;
  rate2Plus: number;
  rate3Plus: number;
}

export interface YearRevenueMetrics {
  year: number;
  totalRevenue: number;
  revShare1Plus: number;
  revShare2Plus: number;
  revShare3Plus: number;
}

export interface MonthlyChartPoint {
  date: string;   // "2024-03-01" — použij jako XAxis dataKey
  ltv: number;    // kumulativní LTV (celkový obrat / celkový počet zákazníků)
  aov: number;    // průměrná objednávka v daném měsíci
}

export interface PurchaseDistPoint {
  label: string;
  customers: number;
  customersPct: number;
  revenue: number;
  revenuePct: number;
}

export interface DaysBin {
  label: string;
  pct: number;
  count: number;
}

/** Avg days between consecutive purchases for a customer */
function avgDaysBetweenOrders(dates: string[]): number {
  if (dates.length < 2) return 0;
  let totalMs = 0;
  for (let i = 1; i < dates.length; i++) {
    totalMs += new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime();
  }
  return totalMs / (dates.length - 1) / 86400000;
}

export function computeRetentionKpis(data: CustomerRetentionRecord[]): RetentionKpis {
  const totalCustomers = data.length;
  let totalRevenue = 0;
  let totalOrders = 0;
  let repeatCount = 0;
  let daysBetweenSum = 0;
  let daysBetweenCount = 0;

  for (const c of data) {
    const orderCount = c.dates.length;
    totalOrders += orderCount;
    for (const rv of c.revsVat) totalRevenue += rv;

    if (orderCount > 1) {
      repeatCount++;
      daysBetweenSum += avgDaysBetweenOrders(c.dates);
      daysBetweenCount++;
    }
  }

  return {
    totalCustomers,
    totalRevenue,
    avgOrderValue:      totalOrders > 0 ? totalRevenue / totalOrders : 0,
    repeatPurchaseRate: totalCustomers > 0 ? (repeatCount / totalCustomers) * 100 : 0,
    avgDaysBetween:     daysBetweenCount > 0 ? daysBetweenSum / daysBetweenCount : 0,
    ltvPerCustomer:     totalCustomers > 0 ? totalRevenue / totalCustomers : 0,
  };
}

export function computeYearCustomerMetrics(data: CustomerRetentionRecord[]): YearCustomerMetrics[] {
  const yearsSet = new Set<number>();
  for (const c of data) {
    for (const d of c.dates) yearsSet.add(parseInt(d.substring(0, 4)));
  }
  const years = [...yearsSet].sort();
  const totalOrders = data.map(c => c.dates.length);

  return years.map(year => {
    const yearStr = year.toString();
    let customers = 0, newCustomers = 0, returningCustomers = 0;
    let orders = 0, revenueSum = 0;
    let firstPurchaseSum = 0, firstPurchaseCount = 0;
    let repeatPurchaseSum = 0, repeatPurchaseCount = 0;
    let daysBetweenSum = 0, daysBetweenCount = 0;

    for (let ci = 0; ci < data.length; ci++) {
      const c = data[ci];
      const inYearIndices: number[] = [];
      for (let i = 0; i < c.dates.length; i++) {
        if (c.dates[i].startsWith(yearStr)) inYearIndices.push(i);
      }
      if (inYearIndices.length === 0) continue;

      customers++;
      const isNew = c.dates[0].startsWith(yearStr);
      const hasOrdersBefore = c.dates.some(d => !d.startsWith(yearStr) && d < yearStr + '-01-01');

      if (isNew) {
        newCustomers++;
        firstPurchaseSum += c.revsVat[0];
        firstPurchaseCount++;
      }
      if (hasOrdersBefore) {
        returningCustomers++;
      }

      for (const idx of inYearIndices) {
        orders++;
        revenueSum += c.revsVat[idx];
        if (hasOrdersBefore) {
          repeatPurchaseSum += c.revsVat[idx];
          repeatPurchaseCount++;
        }
      }

      if (totalOrders[ci] > 1) {
        daysBetweenSum += avgDaysBetweenOrders(c.dates);
        daysBetweenCount++;
      }
    }

    return {
      year,
      customers,
      newCustomers,
      returningCustomers,
      orders,
      avgOrderValue:     orders > 0 ? revenueSum / orders : 0,
      avgFirstPurchase:  firstPurchaseCount > 0 ? firstPurchaseSum / firstPurchaseCount : 0,
      avgRepeatPurchase: repeatPurchaseCount > 0 ? repeatPurchaseSum / repeatPurchaseCount : 0,
      avgDaysBetween:    daysBetweenCount > 0 ? daysBetweenSum / daysBetweenCount : 0,
    };
  });
}

export function computeYearRetentionMetrics(data: CustomerRetentionRecord[]): YearRetentionMetrics[] {
  const yearsSet = new Set<number>();
  for (const c of data) {
    for (const d of c.dates) yearsSet.add(parseInt(d.substring(0, 4)));
  }
  const years = [...yearsSet].sort();

  return years.map(year => {
    const yearStr = year.toString();
    let customers = 0, count1Plus = 0, count2Plus = 0, count3Plus = 0;

    for (const c of data) {
      if (!c.dates.some(d => d.startsWith(yearStr))) continue;
      customers++;
      const total = c.dates.length;
      if (total > 1) count1Plus++;
      if (total > 2) count2Plus++;
      if (total > 3) count3Plus++;
    }

    return {
      year, customers,
      rate1Plus: customers > 0 ? (count1Plus / customers) * 100 : 0,
      rate2Plus: customers > 0 ? (count2Plus / customers) * 100 : 0,
      rate3Plus: customers > 0 ? (count3Plus / customers) * 100 : 0,
    };
  });
}

export function computeYearRevenueMetrics(data: CustomerRetentionRecord[]): YearRevenueMetrics[] {
  const yearsSet = new Set<number>();
  for (const c of data) {
    for (const d of c.dates) yearsSet.add(parseInt(d.substring(0, 4)));
  }
  const years = [...yearsSet].sort();
  const totalOrderCount = data.map(c => c.dates.length);

  return years.map(year => {
    const yearStr = year.toString();
    let totalRevenue = 0, rev1Plus = 0, rev2Plus = 0, rev3Plus = 0;

    for (let ci = 0; ci < data.length; ci++) {
      const c = data[ci];
      const tc = totalOrderCount[ci];
      for (let i = 0; i < c.dates.length; i++) {
        if (!c.dates[i].startsWith(yearStr)) continue;
        const rv = c.revsVat[i];
        totalRevenue += rv;
        if (tc > 1) rev1Plus += rv;
        if (tc > 2) rev2Plus += rv;
        if (tc > 3) rev3Plus += rv;
      }
    }

    return {
      year, totalRevenue,
      revShare1Plus: totalRevenue > 0 ? (rev1Plus / totalRevenue) * 100 : 0,
      revShare2Plus: totalRevenue > 0 ? (rev2Plus / totalRevenue) * 100 : 0,
      revShare3Plus: totalRevenue > 0 ? (rev3Plus / totalRevenue) * 100 : 0,
    };
  });
}

/** Měsíční LTV (kumulativní) a AOV pro line charts */
export function computeMonthlyChartData(data: CustomerRetentionRecord[]): MonthlyChartPoint[] {
  const byMonth: Record<string, { revenue: number; orders: number }> = {};
  const customerFirstMonth: string[] = data.map(c => c.dates[0]?.substring(0, 7) ?? '');

  for (const c of data) {
    for (let i = 0; i < c.dates.length; i++) {
      const m = c.dates[i].substring(0, 7);
      if (!byMonth[m]) byMonth[m] = { revenue: 0, orders: 0 };
      byMonth[m].revenue += c.revsVat[i];
      byMonth[m].orders++;
    }
  }

  const months = Object.keys(byMonth).sort();
  let cumRevenue = 0;

  return months.map(month => {
    const m = byMonth[month];
    cumRevenue += m.revenue;
    const cumCustomers = customerFirstMonth.filter(fm => fm <= month).length;
    return {
      date: month + '-01',
      ltv: cumCustomers > 0 ? cumRevenue / cumCustomers : 0,
      aov: m.orders > 0 ? m.revenue / m.orders : 0,
    };
  });
}

/** Distribuce zákazníků a obratu podle počtu nákupů (1, 2, 3, 4+) */
export function computePurchaseDistribution(data: CustomerRetentionRecord[]): PurchaseDistPoint[] {
  const counts = [0, 0, 0, 0];
  const revenues = [0, 0, 0, 0];

  for (const c of data) {
    const bin = Math.min(c.dates.length - 1, 3);
    counts[bin]++;
    revenues[bin] += c.revsVat.reduce((s, v) => s + v, 0);
  }

  const totalCustomers = data.length;
  const totalRevenue = revenues.reduce((s, v) => s + v, 0);
  const labels = ['1 nákup', '2 nákupy', '3 nákupy', '4+ nákupů'];

  return labels.map((label, i) => ({
    label,
    customers: counts[i],
    customersPct: totalCustomers > 0 ? (counts[i] / totalCustomers) * 100 : 0,
    revenue: revenues[i],
    revenuePct: totalRevenue > 0 ? (revenues[i] / totalRevenue) * 100 : 0,
  }));
}

/** Histogram prodlevy mezi nákupy */
export function computeDaysBetweenHistogram(data: CustomerRetentionRecord[]): DaysBin[] {
  const bins = [
    { label: '0–7 dní',    min: 0,   max: 7 },
    { label: '8–30 dní',   min: 8,   max: 30 },
    { label: '31–60 dní',  min: 31,  max: 60 },
    { label: '61–90 dní',  min: 61,  max: 90 },
    { label: '91–180 dní', min: 91,  max: 180 },
    { label: '181–365 dní',min: 181, max: 365 },
    { label: '365+ dní',   min: 366, max: Infinity },
  ];

  const counts = new Array(bins.length).fill(0);
  let total = 0;

  for (const c of data) {
    for (let i = 1; i < c.dates.length; i++) {
      const days = (new Date(c.dates[i]).getTime() - new Date(c.dates[i - 1]).getTime()) / 86400000;
      for (let b = 0; b < bins.length; b++) {
        if (days >= bins[b].min && days <= bins[b].max) {
          counts[b]++;
          total++;
          break;
        }
      }
    }
  }

  return bins.map((bin, i) => ({
    label: bin.label,
    count: counts[i],
    pct: total > 0 ? (counts[i] / total) * 100 : 0,
  }));
}
