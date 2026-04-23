import React, { useState, useMemo } from 'react';
import { Textarea } from './textarea';
import { Button } from './button';
import { Label } from './label';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

// Collapsible JSON tree node
function JsonNode({ label, data, defaultOpen = true }: { label?: React.ReactNode; data: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  if (data === null || data === undefined)
    return <span>{label}<span className="text-muted-foreground">null</span></span>;
  if (typeof data === 'string')
    return <span>{label}<span className="text-chart-2">"{data}"</span></span>;
  if (typeof data === 'number')
    return <span>{label}<span className="text-chart-1">{data}</span></span>;
  if (typeof data === 'boolean')
    return <span>{label}<span className="text-chart-4">{String(data)}</span></span>;

  const isArray = Array.isArray(data);
  const entries: [string, any][] = isArray
    ? data.map((v: any, i: number) => [String(i), v])
    : Object.entries(data);
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';
  const count = entries.length;

  if (count === 0)
    return <span>{label}<span className="text-muted-foreground">{bracketOpen}{bracketClose}</span></span>;

  return (
    <div>
      <span
        className="cursor-pointer select-none inline-flex items-center hover:bg-accent/50 rounded px-0.5 -ml-0.5"
        onClick={() => setOpen(!open)}
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground mr-0.5 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground mr-0.5 flex-shrink-0" />}
        {label}
        <span className="text-muted-foreground">{bracketOpen}</span>
        {!open && <span className="text-muted-foreground ml-1">... {count} items {bracketClose}</span>}
      </span>
      {open && (
        <>
          <div className="pl-4 border-l border-border/40 ml-1.5">
            {entries.map(([key, value]: [string, any]) => (
              <div key={key}>
                <JsonNode
                  label={
                    isArray
                      ? <span className="text-muted-foreground mr-1">{key}:</span>
                      : <span className="text-chart-5 mr-1">"{key}":</span>
                  }
                  data={value}
                  defaultOpen={count <= 5}
                />
              </div>
            ))}
          </div>
          <span className="text-muted-foreground">{bracketClose}</span>
        </>
      )}
    </div>
  );
}

interface JsonEditorProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (parsed: any) => void;
  error?: string;
  rows?: number;
  placeholder?: string;
  description?: React.ReactNode;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  id, label, value, onChange, onBlur, error, rows = 6, placeholder, description,
}) => {
  const parsed = useMemo(() => {
    try { return { ok: true, data: JSON.parse(value || '{}') }; }
    catch { return { ok: false, data: null }; }
  }, [value]);

  const handleFormat = () => {
    if (parsed.ok) onChange(JSON.stringify(parsed.data, null, 2));
  };

  const handleBlurEvent = () => {
    if (onBlur && parsed.ok) onBlur(parsed.data);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleFormat} disabled={!parsed.ok}>
          格式化
        </Button>
      </div>
      {description}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlurEvent}
          rows={rows}
          placeholder={placeholder}
          className={cn('font-mono text-sm resize-none', error && 'border-destructive')}
        />
        <div
          className={cn(
            'rounded-md border bg-muted/30 p-3 overflow-auto font-mono text-xs',
            !parsed.ok && 'flex items-center justify-center text-muted-foreground'
          )}
          style={{ maxHeight: `${Math.max(rows * 1.5, 6)}rem` }}
        >
          {parsed.ok ? <JsonNode data={parsed.data} /> : 'JSON 格式错误'}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
