/**
 * EmptyState — large centered placeholder for "no items" / "search returned
 * nothing" cases. Kept neutral so it can sit inside any list page.
 */
import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-3 py-16 text-center',
      className,
    )}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {icon ?? <Inbox className="h-5 w-5" />}
    </div>
    <div className="space-y-1">
      <div className="text-[14px] font-medium text-foreground">{title}</div>
      {description && (
        <div className="text-[12.5px] text-muted-foreground max-w-sm">
          {description}
        </div>
      )}
    </div>
    {action && <div className="mt-1">{action}</div>}
  </div>
);
