import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Theme, themes } from '../lib/themes';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

// 主题颜色标识
const themeColors: Record<Theme, string> = {
  slate: '#0f172a', zinc: '#18181b',
  blue: '#3b82f6', green: '#22c55e', orange: '#f97316',
  rose: '#f43f5e', red: '#ef4444', violet: '#8b5cf6', yellow: '#eab308',
  amber: '#f59e0b', cyan: '#06b6d4', emerald: '#10b981',
  fuchsia: '#d946ef', lime: '#84cc16', indigo: '#6366f1',
  pink: '#ec4899', purple: '#a855f7', sky: '#0ea5e9', teal: '#14b8a6',
};

const themeList: Theme[] = Object.keys(themes) as Theme[];

export function ThemeSwitcher() {
  const { theme, mode, setTheme, toggleMode } = useTheme();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMode}
        className="h-9 w-9"
        title={mode === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      >
        {mode === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-9 w-9 p-0" title="选择主题配色">
            <div
              className="h-5 w-5 rounded-full ring-1 ring-border"
              style={{ backgroundColor: themeColors[theme] }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="end">
          <Command>
            <CommandInput placeholder="搜索主题..." />
            <CommandEmpty>未找到主题</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {themeList.map((t) => (
                  <CommandItem
                    key={t}
                    value={t}
                    onSelect={(v) => { setTheme(v as Theme); setOpen(false); }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className="h-4 w-4 rounded-full ring-1 ring-border"
                        style={{ backgroundColor: themeColors[t] }}
                      />
                      <span>{themes[t].label}</span>
                    </div>
                    <Check className={cn("ml-auto h-4 w-4", theme === t ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
