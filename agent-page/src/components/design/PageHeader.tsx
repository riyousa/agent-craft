/**
 * PageHeader — slim 48px top bar that replaces the Layout's default
 * header for redesigned pages.
 *
 * Layout:
 *   [SidebarTrigger] · [breadcrumb...] · [subtitle separator + text] —— [actions] · [mode toggle]
 *
 * Mounting this component automatically hides the app-level Layout
 * header via PageHeaderContext, so we don't end up with two stacked
 * top bars. Unmounting restores it for not-yet-migrated views.
 */
import React from 'react';
import { Moon, Sun, ChevronRight } from 'lucide-react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { useTheme } from '../../contexts/ThemeContext';
import { useHideAppHeader } from '../../contexts/PageHeaderContext';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  /** Crumbs read left-to-right; the last crumb is rendered as the
   *  current page (heavier weight, foreground color). */
  breadcrumb: React.ReactNode[];
  /** Right-of-breadcrumb hint (e.g. "共 24 条"). */
  subtitle?: React.ReactNode;
  /** Page-specific buttons that sit before the theme toggle. */
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumb,
  subtitle,
  actions,
  className,
}) => {
  useHideAppHeader();
  const { mode, toggleMode } = useTheme();

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4',
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 h-7 w-7 shrink-0" />
      <Separator orientation="vertical" className="h-4 shrink-0" />
      <nav className="flex min-w-0 flex-1 items-center gap-2">
        {breadcrumb.map((crumb, i) => {
          const isLast = i === breadcrumb.length - 1;
          // On narrow screens only the final crumb stays visible —
          // intermediate crumbs / chevrons hide via `hidden sm:flex`
          // so the breadcrumb chain doesn't wrap on phones.
          return (
            <React.Fragment key={i}>
              <span
                className={cn(
                  'text-[12.5px]',
                  isLast
                    ? 'min-w-0 truncate font-medium text-foreground'
                    : 'hidden sm:inline shrink-0 text-muted-foreground',
                )}
              >
                {crumb}
              </span>
              {!isLast && (
                <ChevronRight className="hidden sm:block h-3 w-3 shrink-0 text-muted-foreground/60" />
              )}
            </React.Fragment>
          );
        })}
        {subtitle && (
          <span className="hidden md:flex shrink-0 items-center gap-2">
            <Separator orientation="vertical" className="h-3.5" />
            <span className="truncate text-[11.5px] text-muted-foreground">
              {subtitle}
            </span>
          </span>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        {actions}
        {actions && (
          <Separator orientation="vertical" className="mx-1 h-4" />
        )}
        <button
          type="button"
          onClick={toggleMode}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={mode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
        >
          {mode === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  );
};
