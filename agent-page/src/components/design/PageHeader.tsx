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
import React, { useState } from 'react';
import { Moon, Sun, ChevronRight, Check } from 'lucide-react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { useTheme } from '../../contexts/ThemeContext';
import { useHideAppHeader } from '../../contexts/PageHeaderContext';
import { cn } from '../../lib/utils';
import { Theme, themes } from '../../lib/themes';

// Swatch hex per theme — matches the legacy ThemeSwitcher palette.
const THEME_SWATCH: Record<Theme, string> = {
  slate: '#0f172a', zinc: '#18181b',
  blue: '#3b82f6', green: '#22c55e', orange: '#f97316',
  rose: '#f43f5e', red: '#ef4444', violet: '#8b5cf6', yellow: '#eab308',
  amber: '#f59e0b', cyan: '#06b6d4', emerald: '#10b981',
  fuchsia: '#d946ef', lime: '#84cc16', indigo: '#6366f1',
  pink: '#ec4899', purple: '#a855f7', sky: '#0ea5e9', teal: '#14b8a6',
};
const THEME_LIST = Object.keys(themes) as Theme[];

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
  const { mode, toggleMode, theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

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

        {/* Theme palette picker — restored next to the mode toggle.
            Opens a Popover with the full color palette (zinc / slate /
            blue / …); selecting one calls setTheme which mutates the
            HSL CSS variables live. */}
        <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent"
              title="主题配色"
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded-full ring-1 ring-border"
                style={{ backgroundColor: THEME_SWATCH[theme] }}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="end">
            <Command>
              <CommandInput placeholder="搜索主题..." className="h-9" />
              <CommandEmpty>未找到主题</CommandEmpty>
              <CommandList>
                <CommandGroup>
                  {THEME_LIST.map((t) => (
                    <CommandItem
                      key={t}
                      value={t}
                      onSelect={(v) => {
                        setTheme(v as Theme);
                        setPaletteOpen(false);
                      }}
                    >
                      <div className="flex flex-1 items-center gap-2">
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full ring-1 ring-border"
                          style={{ backgroundColor: THEME_SWATCH[t] }}
                        />
                        <span>{themes[t].label}</span>
                      </div>
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          theme === t ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
};
