'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FilterState, TimePeriod, Country } from '@/data/types';
import { getDateRange } from '@/hooks/useFilters';
import { formatDate } from '@/lib/formatters';
import { RefreshCw, Menu } from 'lucide-react';
import { useSidebar } from './ConditionalLayout';
import { lastUpdate } from '@/data/lastUpdate';
import { useHlavniDashboard } from '@/hooks/useHlavniDashboard';

interface TopBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

const ALL_COUNTRIES: Country[] = ['at', 'cz', 'sk', 'pl', 'nl', 'de'];

const countryColors: Record<Country, string> = {
  at: '#ED2939',
  cz: '#D7141A',
  sk: '#0B4EA2',
  pl: '#DC143C',
  nl: '#FF4F00',
  de: '#1a1a1a',
};

const periodLabels: Record<TimePeriod, string> = {
  current_year:  'Aktuální rok',
  current_month: 'Aktuální měsíc',
  last_month:    'Minulý měsíc',
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
  const isHlavniDashboard = pathname === '/hlavni-dashboard';
  const dash = useHlavniDashboard();

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

  const handleCountryToggle = (country: Country) => {
    const active = filters.countries;
    if (active.includes(country)) {
      if (active.length === 1) return; // keep at least one
      onChange({ ...filters, countries: active.filter(c => c !== country) });
    } else {
      onChange({ ...filters, countries: [...active, country] });
    }
  };

  const handleSelectAll = () => {
    onChange({ ...filters, countries: [...ALL_COUNTRIES] });
  };

  const handleCustomDate = (field: 'customStart' | 'customEnd', val: string) => {
    onChange({ ...filters, [field]: val ? new Date(val) : undefined });
  };

  const toInputValue = (d?: Date) => {
    if (!d) return '';
    return d.toISOString().split('T')[0];
  };

  return (
    <div className="bg-white border-b border-slate-100 px-3 md:px-6 py-2 md:py-3">
      <div className="flex items-center gap-1.5 md:gap-4 flex-wrap">

        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="md:hidden p-1.5 -ml-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          aria-label="Otevřít menu"
        >
          <Menu size={20} />
        </button>

        {/* Country selectors */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {ALL_COUNTRIES.map((c) => {
            const active = filters.countries.includes(c);
            return (
              <button
                key={c}
                onClick={() => handleCountryToggle(c)}
                title={c.toUpperCase()}
                style={active ? { backgroundColor: countryColors[c], borderColor: countryColors[c], color: '#fff' } : {}}
                className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase border transition-colors ${
                  active
                    ? 'shadow-sm'
                    : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600 bg-white'
                }`}
              >
                {c}
              </button>
            );
          })}
          {filters.countries.length < ALL_COUNTRIES.length && (
            <button
              onClick={handleSelectAll}
              className="px-2 py-1 rounded-md text-[11px] font-bold border border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600 bg-white transition-colors"
              title="Vybrat vše"
            >
              Vše
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 flex-shrink-0 hidden sm:block" />

        {/* ── Hlavní Dashboard — rok selector ── */}
        {isHlavniDashboard ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Rok:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
              {dash.yearOptions.map((year, idx) => (
                <button
                  key={year}
                  onClick={() => dash.setSelectedYear(year)}
                  className={`px-2.5 md:px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none ${
                    idx > 0 ? 'border-l border-slate-200' : ''
                  } ${
                    dash.selectedYear === year
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">vs. {dash.yearB}</span>
          </div>
        ) : (
          <>
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

            {/* Date range label */}
            <div className="text-xs md:text-sm text-slate-500 hidden sm:block flex-shrink-0">
              <span className="font-medium text-slate-700">{formatDate(start)}</span>
              <span className="mx-1.5 text-slate-300">–</span>
              <span className="font-medium text-slate-700">{formatDate(end)}</span>
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Last update label */}
        <div className="text-xs text-slate-400 hidden md:block flex-shrink-0">
          Data: <span className="font-medium text-slate-500">{new Date(lastUpdate).toLocaleString('de-AT', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
