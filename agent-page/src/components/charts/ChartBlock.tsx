/**
 * Interactive chart renderer for the ```chart code fence.
 *
 * Renders Recharts for bar/line/scatter/pie/area types, with a toolbar
 * for:
 *   - exporting the chart as PNG
 *   - switching chart type (keeps the same data)
 *   - toggling an enlarged/fullscreen view
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { toPng } from 'html-to-image';

import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Dialog, DialogContent } from '../ui/dialog';
import {
  CHART_TYPES,
  ChartSpec,
  ChartType,
  parseChartSpec,
} from './chart-schema';
import { Download, Expand, AlertTriangle } from 'lucide-react';

// Recharts writes these directly onto SVG stroke/fill attributes, where
// CSS `var(--x)` does not resolve reliably across browsers — using literal
// hex keeps lines visible in all cases and doesn't depend on the theme.
// Ordered so the first few are visually distinct for the common 1-3 series
// case, with warmer / contrasting hues at the tail for larger palettes.
const CHART_COLORS = [
  '#0ea5e9', // sky
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // violet
  '#22c55e', // green
  '#06b6d4', // cyan
];

const TYPE_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  line: '折线图',
  scatter: '散点图',
  pie: '饼图',
  area: '面积图',
};

interface InnerProps {
  spec: ChartSpec;
  effectiveType: ChartType;
  height: number;
}

const ChartInner: React.FC<InnerProps> = ({ spec, effectiveType, height }) => {
  const colors = (i: number) => spec.series[i]?.color || CHART_COLORS[i % CHART_COLORS.length];

  if (effectiveType === 'pie') {
    // Pie uses the first series only; each data row becomes a slice.
    const s = spec.series[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={spec.data as any}
            dataKey={s.dataKey}
            nameKey={spec.xKey}
            outerRadius="75%"
            label
            paddingAngle={1}
          >
            {spec.data.map((_, i) => (
              <Cell
                key={i}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (effectiveType === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={spec.xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <ZAxis range={[80, 80]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {spec.series.map((s, i) => (
            <Scatter
              key={s.dataKey}
              name={s.name || s.dataKey}
              data={spec.data as any}
              dataKey={s.dataKey}
              fill={colors(i)}
              stroke={colors(i)}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  const Chart = effectiveType === 'bar' ? BarChart : effectiveType === 'area' ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={spec.data as any} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          cursor={effectiveType === 'bar' ? { fill: 'rgba(0,0,0,0.04)' } : true}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {spec.series.map((s, i) => {
          const color = colors(i);
          const name = s.name || s.dataKey;
          if (effectiveType === 'bar') {
            return (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={name}
                fill={color}
                radius={[4, 4, 0, 0]}
              />
            );
          }
          if (effectiveType === 'area') {
            return (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={name}
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.25}
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            );
          }
          // LineChart — make sure the stroke is visible even with a single
          // series or a single data point; Recharts draws no line between
          // <2 points but the dots still need to be obvious.
          return (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={name}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 4, fill: color, stroke: color, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls
              isAnimationActive={false}
            />
          );
        })}
      </Chart>
    </ResponsiveContainer>
  );
};

interface ChartBlockProps {
  /** Raw JSON string from the ```chart``` fence */
  raw: string;
}

export const ChartBlock: React.FC<ChartBlockProps> = ({ raw }) => {
  const parsed = useMemo(() => parseChartSpec(raw), [raw]);
  const [typeOverride, setTypeOverride] = useState<ChartType | null>(null);
  const [expanded, setExpanded] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  if (!parsed.ok) {
    return (
      <Alert variant="destructive" className="my-3">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>图表渲染失败</AlertTitle>
        <AlertDescription>
          <p className="text-sm mb-2">{parsed.error}</p>
          <details className="text-xs">
            <summary className="cursor-pointer opacity-70">查看原始数据</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-muted-foreground">
              {raw}
            </pre>
          </details>
        </AlertDescription>
      </Alert>
    );
  }

  const spec = parsed.spec;
  const effectiveType: ChartType = typeOverride || spec.type;

  const handleExport = async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: 'white',
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${spec.title || 'chart'}.png`;
      a.click();
    } catch (e) {
      console.error('Chart PNG export failed:', e);
    }
  };

  const toolbar = (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
      {spec.title && (
        <h3 className="flex-1 text-sm font-semibold truncate">{spec.title}</h3>
      )}
      <Select
        value={effectiveType}
        onValueChange={(v) => setTypeOverride(v as ChartType)}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHART_TYPES.map((t) => (
            <SelectItem key={t} value={t} className="text-xs">
              {TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleExport}
        title="导出 PNG"
        aria-label="导出 PNG"
      >
        <Download className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setExpanded(true)}
        title="放大"
        aria-label="放大"
      >
        <Expand className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <>
      <div className="my-3 rounded-lg border bg-background overflow-hidden">
        {toolbar}
        <div ref={captureRef} className="p-3 bg-background">
          <ChartInner spec={spec} effectiveType={effectiveType} height={300} />
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 flex flex-col">
          {toolbar}
          <div className="flex-1 p-4">
            <ChartInner spec={spec} effectiveType={effectiveType} height={720} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
