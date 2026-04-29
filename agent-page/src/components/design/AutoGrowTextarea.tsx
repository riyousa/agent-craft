/**
 * AutoGrowTextarea — Textarea that auto-grows from `minHeight` up to
 * `maxHeight`, then becomes scrollable. Used in the AI assistant
 * input on the editor right pane / mobile drawer where the user may
 * paste a long cURL but the slot can't crowd out the rest of the panel.
 *
 * Wraps shadcn Textarea so existing tailwind class names and
 * disabled/value/onChange APIs stay the same.
 */
import React, { useEffect, useRef } from 'react';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';

interface AutoGrowTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  /** px height the textarea starts at and won't shrink below. */
  minHeight?: number;
  /** px ceiling — beyond this the textarea scrolls internally. */
  maxHeight?: number;
  className?: string;
}

export const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  minHeight = 68,
  maxHeight = 220,
  className,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-measure on every value change. height='auto' first so the
  // browser reports the natural scrollHeight, then clamp.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.max(minHeight, Math.min(ta.scrollHeight, maxHeight));
    ta.style.height = `${next}px`;
  }, [value, minHeight, maxHeight]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={cn('resize-none overflow-y-auto', className)}
      style={{ minHeight, maxHeight }}
    />
  );
};
