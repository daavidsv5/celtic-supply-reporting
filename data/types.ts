export type Country = 'at';
export type Currency = 'EUR';

export interface DailyRecord {
  date: string; // ISO date "2026-03-13"
  country: Country;
  currency: Currency;
  revenue: number;            // bez DPH (EUR)
  revenue_vat: number;        // s DPH (EUR)
  orders: number;
  orders_cancelled: number;
  cost: number;               // marketing cost (EUR)
}

export interface KpiData {
  revenuevat: number;
  revenue: number;
  orders: number;
  aov: number;
  cost: number;
  pno: number;
  cpa: number;
  ordersCancelled: number;
  cancelRate: number;
}

export type TimePeriod = 'current_year' | 'current_month' | 'last_month' | 'last_14_days' | 'last_year' | 'custom';

export interface FilterState {
  countries: Country[];
  timePeriod: TimePeriod;
  customStart?: Date;
  customEnd?: Date;
}

export function getDisplayCurrency(_countries: Country[]): Currency {
  return 'EUR';
}
