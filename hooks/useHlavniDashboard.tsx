'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { mockData } from '@/data/mockGenerator';

interface HlavniDashCtx {
  yearA: number;
  yearB: number;
  yearOptions: number[];
  selectedYear: number;
  setSelectedYear: (y: number) => void;
}

const Ctx = createContext<HlavniDashCtx | null>(null);

function getAvailableYears(): number[] {
  const years = new Set<number>();
  for (const r of mockData) years.add(+r.date.slice(0, 4));
  return Array.from(years).sort((a, b) => b - a);
}

export function HlavniDashboardProvider({ children }: { children: React.ReactNode }) {
  const availableYears = useMemo(() => getAvailableYears(), []);
  const defaultYear = availableYears[0] ?? new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  return (
    <Ctx.Provider value={{ yearA: selectedYear, yearB: selectedYear - 1, yearOptions: availableYears, selectedYear, setSelectedYear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useHlavniDashboard(): HlavniDashCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHlavniDashboard must be used within HlavniDashboardProvider');
  return ctx;
}
