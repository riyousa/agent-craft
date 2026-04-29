/**
 * TablePagination — 上一页 / N / M / 下一页 row used under the
 * tools / skills / users tables.
 *
 * Stateless: parent owns `page` and decides when to recompute
 * `totalPages` (server-paged tables compute from `total / pageSize`,
 * client-paged tables from `filtered.length / pageSize`).
 *
 * Visibility:
 *   - `totalItems === 0` → render nothing (truly empty list).
 *   - otherwise → always render. Buttons are disabled at edges
 *     (and on single-page lists) so the bar is discoverable; users
 *     get a consistent count hint regardless of list size.
 */
import React from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional left-side hint, e.g. "共 124 条 · 每页 20". */
  hint?: React.ReactNode;
  /** Used only to decide whether to render the bar at all — pass the
   *  filtered/total row count from the caller. Defaults to 1 so the
   *  bar still renders if the caller forgets to pass it. */
  totalItems?: number;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  hint,
  totalItems = 1,
  className,
}) => {
  if (totalItems <= 0) return null;
  const safeTotal = Math.max(1, totalPages);
  return (
    <div
      className={cn(
        'mt-4 flex flex-wrap items-center justify-between gap-3',
        className,
      )}
    >
      {hint ? (
        <span className="text-[11.5px] text-muted-foreground">{hint}</span>
      ) : (
        <span />
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {page} / {safeTotal}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= safeTotal}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
};
