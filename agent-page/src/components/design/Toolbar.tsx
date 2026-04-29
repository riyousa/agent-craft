/**
 * Toolbar — flex row sitting above tables for search + filters + actions.
 * Wrapping with consistent gap so child controls don't collapse on narrow
 * widths.
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface ToolbarProps {
  className?: string;
  children: React.ReactNode;
}

export const Toolbar: React.FC<ToolbarProps> = ({ className, children }) => (
  <div
    className={cn(
      'mb-4 flex flex-wrap items-center gap-2',
      className,
    )}
  >
    {children}
  </div>
);
