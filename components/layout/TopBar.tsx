'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FilterState, Country, TimePeriod } from '@/data/types';
import { getDateRange } from '@/hooks/useFilters';
import { formatDate } from '@/lib/formatters';
import { RefreshCw, Menu } from 'lucide-react';
import { useSidebar } from './ConditionalLayout';
import { lastUpdate } from '@/data/lastUpdate';

interface TopBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

const periodLabels: Record<TimePeriod, string> = {
  current_year:  'Aktuální rok',
  current_month: 'Aktuální měsíc',
  last_14_days:  'Posledních 14 dní',
  last_year:     'Minulý rok',
  custom:        'Vlastní období',
};

export default function TopBar({ filters, onChange }: TopBarProps) {
  const { start, end } = getDateRange(filters);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const { toggle } = useSidebar();
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === 'admin';
  const isRetention = pathname === '/retention' || pathname === '/crosssell';
  const hideAll = pathname === '/shipping';

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const json = await res.json();
      setUpdateMsg(json.ok ? 'Data aktualizována — obnovte stránku.' : `Chyba: ${json.log ?? json.error ?? 'neznámá chyba'}`);
    } catch {
      setUpdateMsg('Chyba při aktualizaci.');
    } finally {
      setUpdating(false);
    }
  };

  const handlePeriodChange = (period: TimePeriod) => {
    onChange({ ...filters, timePeriod: period });
  };

  const handleCustomDate = (field: 'customStart' | 'customEnd', val: string) => {
    onChange({ ...filters, [field]: val ? new Date(val) : undefined });
  };

  const toInputValue = (d?: Date) => {
    if (!d) return '';
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="bg-white border-b border-slate-100 px-3 md:px-6 py-2.5 md:py-3">
      {/* Single row — wraps on smaller screens */}
      <div className="flex items-center gap-2 md:gap-4 flex-wrap">

        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="md:hidden p-1.5 -ml-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          aria-label="Otevřít menu"
        >
          <Menu size={20} />
        </button>

        {/* Country segmented control — hidden on retention page */}
        {!isRetention && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Trh:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
              {([
                { label: 'Vše', value: 'all' },
                { label: '🇨🇿', value: 'cz' },
                { label: '🇸🇰', value: 'sk' },
              ] as { label: string; value: 'all' | Country }[]).filter(({ value }) => !(hideAll && value === 'all')).map(({ label, value }, idx) => {
                const isActive =
                  value === 'all'
                    ? filters.countries.length === 2
                    : filters.countries.length === 1 && filters.countries[0] === value;
                const select = () => {
                  if (value === 'all') onChange({ ...filters, countries: ['cz', 'sk'] });
                  else onChange({ ...filters, countries: [value as Country] });
                };
                return (
                  <button
                    key={value}
                    onClick={select}
                    className={`px-2.5 md:px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none ${
                      idx > 0 ? 'border-l border-slate-200' : ''
                    } ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {/* Show CZ/SK text only on sm+ */}
                    <span className="sm:hidden">{label}</span>
                    <span className="hidden sm:inline">
                      {value === 'all' ? 'Vše' : value === 'cz' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider — desktop only */}
        {!isRetention && <div className="h-6 w-px bg-slate-100 hidden md:block flex-shrink-0" />}

        {/* Time period */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">Období:</span>
          <select
            value={filters.timePeriod}
            onChange={(e) => handlePeriodChange(e.target.value as TimePeriod)}
            className="border border-slate-200 rounded-lg px-2 md:px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {(Object.keys(periodLabels) as TimePeriod[]).map((p) => (
              <option key={p} value={p}>{periodLabels[p]}</option>
            ))}
          </select>
        </div>

        {/* Custom date range */}
        {filters.timePeriod === 'custom' && (
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            <input
              type="date"
              value={toInputValue(filters.customStart)}
              onChange={(e) => handleCustomDate('customStart', e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-xs">–</span>
            <input
              type="date"
              value={toInputValue(filters.customEnd)}
              onChange={(e) => handleCustomDate('customEnd', e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Date range label — hidden on small mobile */}
        <div className="text-xs md:text-sm text-slate-500 hidden sm:block flex-shrink-0">
          <span className="font-medium text-slate-700">{formatDate(start)}</span>
          <span className="mx-1.5 text-slate-300">–</span>
          <span className="font-medium text-slate-700">{formatDate(end)}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Last update label */}
        <div className="text-xs text-slate-400 hidden md:block flex-shrink-0">
          Data: <span className="font-medium text-slate-500">{new Date(lastUpdate).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Update button — admin only */}
        <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (<>
          {updateMsg && (
            <span
              title={updateMsg}
              className={`text-xs font-medium max-w-xs truncate ${updateMsg.startsWith('Chyba') ? 'text-rose-500' : 'text-emerald-600'}`}
            >
              {updateMsg}
            </span>
          )}
          <button
            onClick={handleUpdate}
            disabled={updating}
            title={updateMsg ?? 'Aktualizovat data'}
            className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={13} className={updating ? 'animate-spin' : ''} />
            <span className="hidden md:inline">{updating ? 'Aktualizuji…' : 'Aktualizovat data'}</span>
          </button>
        </>)}
        </div>
      </div>
    </div>
  );
}
