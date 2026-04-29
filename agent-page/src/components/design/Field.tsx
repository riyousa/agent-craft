/**
 * Field — labelled form input slot used inside a 12-col grid.
 *
 * Mirrors the design bundle's <Field> atom (screens-shared.jsx:114):
 * compact 12px label with optional required asterisk, input slot,
 * and a small hint line below. Callers compose the actual input
 * element themselves; Field is just the chrome.
 *
 * Use via:
 *   <div className="grid grid-cols-12 gap-3.5">
 *     <Field label="工具名" span={6} required hint="snake_case">
 *       <Input ... />
 *     </Field>
 *     ...
 *   </div>
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface FieldProps {
  label: React.ReactNode;
  /** Number of grid columns (1-12) the field occupies. */
  span?: 3 | 4 | 6 | 8 | 9 | 12;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const SPAN_CLASS: Record<NonNullable<FieldProps['span']>, string> = {
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  12: 'col-span-12',
};

export const Field: React.FC<FieldProps> = ({
  label,
  span = 12,
  required,
  hint,
  className,
  children,
}) => (
  <label
    className={cn(
      'col-span-12 flex flex-col gap-1.5',
      SPAN_CLASS[span],
      className,
    )}
  >
    <span className="flex items-center gap-1 text-[12px] font-medium text-foreground">
      {label}
      {required && <span className="text-destructive">*</span>}
    </span>
    {children}
    {hint && (
      <span className="text-[11px] leading-relaxed text-muted-foreground">
        {hint}
      </span>
    )}
  </label>
);
