/**
 * H2 — section header used inside flat editor pages.
 *
 * The v3 design rejects the "every section is a Card with shadow" look.
 * Instead, sections sit in a single column separated by an H2 row:
 * a small bold label on the left, a hairline rule that fills the
 * remaining width, and an optional ghost action on the right
 * (e.g. 「+ 添加参数」).
 *
 * Reference: design bundle screens-shared.jsx:264 H2.
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface H2Props {
  children: React.ReactNode;
  /** Right-side hint or action — usually a small ghost button. */
  action?: React.ReactNode;
  /** First H2 on a page should drop the top margin. */
  first?: boolean;
  className?: string;
}

export const H2: React.FC<H2Props> = ({ children, action, first = false, className }) => (
  <div
    className={cn(
      'flex items-center gap-3',
      first ? 'mb-3 mt-0' : 'mb-3 mt-6',
      className,
    )}
  >
    <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
      {children}
    </h2>
    <div className="flex-1 h-px bg-border" />
    {action}
  </div>
);
