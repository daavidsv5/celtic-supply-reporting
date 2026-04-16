export type Country = 'at' | 'cz' | 'sk' | 'pl' | 'nl' | 'de';
export type Currency = 'EUR' | 'CZK' | 'PLN';

export interface DailyRecord {
  date: string; // ISO date "2026-03-13"
  country: Country;
  currency: Currency;
  revenue: number;
  revenue_vat: number;
  orders: number;
  orders_cancelled: number;
  cost: number;
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

export function getDisplayCurrency(countries: Country[]): Currency {
  if (countries.length > 1) return 'CZK'; // multi-country → aggregate in CZK
  if (countries[0] === 'pl') return 'PLN';
  if (countries[0] === 'cz') return 'CZK';
  return 'EUR';
}

export const ALL_COUNTRIES: Country[] = ['at', 'cz', 'sk', 'pl', 'nl', 'de'];

export function isAllCountries(countries: Country[]): boolean {
  return countries.length === ALL_COUNTRIES.length;
}
