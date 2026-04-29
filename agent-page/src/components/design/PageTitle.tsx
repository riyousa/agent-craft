/**
 * PageTitle — large H1 + description + right-side action group.
 *
 * Used at the top of every list / management page in the v3 design.
 * Kept dumb on purpose: callers compose buttons, badges, etc. into
 * `actions` themselves.
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface PageTitleProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({
  title,
  description,
  actions,
  className,
}) => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 mb-5',
      className,
    )}
  >
    <div className="min-w-0 flex-1">
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
    )}
  </div>
);
