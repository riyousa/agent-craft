/**
 * Pill — semantic colored chip used everywhere lists need a status/risk/source label.
 *
 * Wraps shadcn `Badge` so we have one place to control radii, padding, and
 * the seven semantic colors used in the v3 design (`design_update.md` Phase 0).
 *
 * Variants map directly to the design's color tokens; each variant has its
 * own light + dark mode treatment via Tailwind theme variables, so callers
 * never deal with hex / hsl directly.
 */
import React from 'react';
import { cn } from '../../lib/utils';

export type PillTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'outline';

interface PillProps {
  tone?: PillTone;
  /** Render a small leading dot — used for status pills like "已启用 ●". */
  dot?: boolean;
  /** Use the mono font (for codes / IDs / numeric tags). */
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}

const toneClasses: Record<PillTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  // chart-2 is the project-wide success accent (see tailwind.config.js).
  success: 'bg-chart-2/15 text-chart-2',
  warning: 'bg-chart-4/15 text-chart-4',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-chart-1/15 text-chart-1',
  // primary inverse — used for "default" / accent labels.
  accent: 'bg-primary text-primary-foreground',
  outline: 'border border-border text-muted-foreground bg-transparent',
};

const dotClasses: Record<PillTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-chart-2',
  warning: 'bg-chart-4',
  danger: 'bg-destructive',
  info: 'bg-chart-1',
  accent: 'bg-primary-foreground',
  outline: 'bg-muted-foreground',
};

export const Pill: React.FC<PillProps> = ({
  tone = 'neutral',
  dot = false,
  mono = false,
  className,
  children,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-none whitespace-nowrap',
      mono && 'font-mono',
      toneClasses[tone],
      className,
    )}
  >
    {dot && (
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', dotClasses[tone])}
      />
    )}
    {children}
  </span>
);
