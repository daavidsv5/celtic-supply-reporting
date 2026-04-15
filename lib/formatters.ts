export function formatCurrency(value: number, currency: 'CZK' | 'EUR' | 'PLN' = 'CZK'): string {
  if (currency === 'EUR') {
    const formatted = value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return `${formatted}\u00a0€`;
  }
  if (currency === 'PLN') {
    const formatted = value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return `${formatted}\u00a0zł`;
  }
  const formatted = Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${formatted}\u00a0Kč`;
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace('.', ',')}\u00a0%`;
}

export function formatNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

export function formatDate(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return `${d}.\u00a0${m}.\u00a0${y}`;
}

export function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(day)}.\u00a0${parseInt(month)}.`;
}

const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

export function formatMonthYear(dateStr: string): string {
  const [year, month] = dateStr.split('-');
  return `${MONTHS_CS[parseInt(month) - 1]} ${year}`;
}

/** Returns local date as "YYYY-MM-DD" without UTC conversion. */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
