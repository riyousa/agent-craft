/**
 * StatCard — admin pages use a row of these above tables to show key
 * metrics (active users, monthly token spend, etc.).
 *
 * Layout: ALL-CAPS micro-label / big number / sub line.
 * Sub line tone follows `trend`:
 *   - 'up'   green
 *   - 'down' destructive
 *   - 'flat' muted (default)
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  trend = 'flat',
  className,
}) => {
  const subTone =
    trend === 'up'
      ? 'text-chart-2'
      : trend === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3.5',
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight text-foreground">
        {value}
      </div>
      {sub && (
        <div className={cn('mt-1.5 font-mono text-[11.5px] leading-snug', subTone)}>
          {sub}
        </div>
      )}
    </div>
  );
};
