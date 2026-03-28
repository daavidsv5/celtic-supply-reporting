'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  yoy: number | null;
  icon?: React.ReactNode;
  sparklineData?: number[];
  invertColors?: boolean;
  hasPrevData?: boolean;
  variant?: 'default' | 'green' | 'red';
}

export default function KpiCard({
  title,
  value,
  yoy,
  icon,
  invertColors = false,
  hasPrevData = true,
  variant = 'default',
}: KpiCardProps) {
  const isPositive = invertColors ? (yoy ?? 0) < 0 : (yoy ?? 0) > 0;
  const isNeutral  = yoy === 0 || yoy === null;

  const borderColor = variant === 'green' ? 'border-emerald-700' : variant === 'red' ? 'border-rose-600' : 'border-blue-800';
  const iconBg      = variant === 'green' ? 'bg-emerald-50 text-emerald-700' : variant === 'red' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600';

  return (
    <div className={`bg-white rounded-2xl p-4 border-2 ${borderColor} shadow-sm flex flex-col gap-3`}>
      {/* Top row: icon + title + YoY badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              {icon}
            </div>
          )}
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider leading-snug">
            {title}
          </p>
        </div>
        {hasPrevData && !isNeutral && (
          <span
            className={`inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg flex-shrink-0 ${
              isPositive
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-rose-50 text-rose-500'
            }`}
          >
            {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Value */}
      <p className={`text-2xl md:text-3xl font-bold leading-none ${variant === 'green' ? 'text-emerald-700' : variant === 'red' ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>

      {/* Footer label */}
      <p className="text-[11px] text-slate-400">
        {!hasPrevData ? 'bez YoY srovnání' : 'vs. loňský rok'}
      </p>
    </div>
  );
}
