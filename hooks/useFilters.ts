'use client';

import React, { createContext, useContext, useState } from 'react';
import { FilterState, TimePeriod } from '@/data/types';

interface DateRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

interface FiltersContextValue {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  getDateRange: (f: FilterState) => DateRange;
}

const TODAY = new Date();

export function getDateRange(filters: FilterState): DateRange {
  let start: Date;
  let end: Date;

  switch (filters.timePeriod) {
    case 'yesterday': {
      start = new Date(TODAY);
      start.setDate(start.getDate() - 1);
      end = new Date(start);
      break;
    }
    case 'last_7_days': {
      end = new Date(TODAY);
      start = new Date(TODAY);
      start.setDate(start.getDate() - 6);
      break;
    }
    case 'current_year': {
      start = new Date(TODAY.getFullYear(), 0, 1);
      end = new Date(TODAY);
      break;
    }
    case 'current_month': {
      start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      end = new Date(TODAY);
      break;
    }
    case 'last_month': {
      start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
      end   = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0);
      break;
    }
    case 'last_14_days': {
      end = new Date(TODAY);
      start = new Date(TODAY);
      start.setDate(start.getDate() - 13);
      break;
    }
    case 'last_year': {
      const ly = TODAY.getFullYear() - 1;
      start = new Date(ly, 0, 1);
      end   = new Date(ly, 11, 31);
      break;
    }
    case 'all_time': {
      start = new Date(2023, 0, 1);
      end   = new Date(TODAY);
      break;
    }
    case 'custom': {
      start = filters.customStart ? new Date(filters.customStart) : new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      end   = filters.customEnd   ? new Date(filters.customEnd)   : new Date(TODAY);
      break;
    }
    default: {
      start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      end   = new Date(TODAY);
    }
  }

  const prevStart = new Date(start);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(end);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  return { start, end, prevStart, prevEnd };
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

const defaultFilters: FilterState = {
  countries: ['at'],
  timePeriod: 'current_month',
};

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  return React.createElement(
    FiltersContext.Provider,
    { value: { filters, setFilters, getDateRange } },
    children
  );
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
}
