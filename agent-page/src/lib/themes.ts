/**
 * shadcn/ui 主题配色方案
 * 所有 CSS 变量由 ThemeProvider 动态注入，index.css 不定义任何颜色变量。
 * chart: 1=信息 2=成功 3=中性 4=警告 5=危险
 */

export type Theme =
  | 'zinc' | 'slate' | 'red' | 'rose' | 'orange' | 'green' | 'blue' | 'yellow' | 'violet'
  | 'amber' | 'cyan' | 'emerald' | 'fuchsia' | 'lime' | 'indigo' | 'pink' | 'purple' | 'sky' | 'teal';

export interface ThemeConfig {
  name: string;
  label: string;
  cssVars: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

// chart 颜色跟随主题配色: 1=信息 2=成功 3=中性 4=警告 5=危险
// 每个主题有独特的 chart 配色方案
const chartColors: Record<string, { light: Record<string, string>; dark: Record<string, string> }> = {
  neutral: {
    light: { 'chart-1': 'oklch(0.87 0 0)', 'chart-2': 'oklch(0.556 0 0)', 'chart-3': 'oklch(0.439 0 0)', 'chart-4': 'oklch(0.371 0 0)', 'chart-5': 'oklch(0.269 0 0)' },
    dark: { 'chart-1': 'oklch(0.87 0 0)', 'chart-2': 'oklch(0.556 0 0)', 'chart-3': 'oklch(0.439 0 0)', 'chart-4': 'oklch(0.371 0 0)', 'chart-5': 'oklch(0.269 0 0)' },
  },
  amber: {
    light: { 'chart-1': 'oklch(0.879 0.169 91.605)', 'chart-2': 'oklch(0.769 0.188 70.08)', 'chart-3': 'oklch(0.666 0.179 58.318)', 'chart-4': 'oklch(0.555 0.163 48.998)', 'chart-5': 'oklch(0.473 0.137 46.201)' },
    dark: { 'chart-1': 'oklch(0.879 0.169 91.605)', 'chart-2': 'oklch(0.769 0.188 70.08)', 'chart-3': 'oklch(0.666 0.179 58.318)', 'chart-4': 'oklch(0.555 0.163 48.998)', 'chart-5': 'oklch(0.473 0.137 46.201)' },
  },
  blue: {
    light: { 'chart-1': 'oklch(0.809 0.105 251.813)', 'chart-2': 'oklch(0.623 0.214 259.815)', 'chart-3': 'oklch(0.546 0.245 262.881)', 'chart-4': 'oklch(0.488 0.243 264.376)', 'chart-5': 'oklch(0.424 0.199 265.638)' },
    dark: { 'chart-1': 'oklch(0.809 0.105 251.813)', 'chart-2': 'oklch(0.623 0.214 259.815)', 'chart-3': 'oklch(0.546 0.245 262.881)', 'chart-4': 'oklch(0.488 0.243 264.376)', 'chart-5': 'oklch(0.424 0.199 265.638)' },
  },
  cyan: {
    light: { 'chart-1': 'oklch(0.865 0.127 207.078)', 'chart-2': 'oklch(0.715 0.143 215.221)', 'chart-3': 'oklch(0.609 0.126 221.723)', 'chart-4': 'oklch(0.52 0.105 223.128)', 'chart-5': 'oklch(0.45 0.085 224.283)' },
    dark: { 'chart-1': 'oklch(0.865 0.127 207.078)', 'chart-2': 'oklch(0.715 0.143 215.221)', 'chart-3': 'oklch(0.609 0.126 221.723)', 'chart-4': 'oklch(0.52 0.105 223.128)', 'chart-5': 'oklch(0.45 0.085 224.283)' },
  },
  emerrald: {
    light: { 'chart-1': 'oklch(0.845 0.143 164.978)', 'chart-2': 'oklch(0.696 0.17 162.48)', 'chart-3': 'oklch(0.596 0.145 163.225)', 'chart-4': 'oklch(0.508 0.118 165.612)', 'chart-5': 'oklch(0.432 0.095 166.913)' },
    dark: { 'chart-1': 'oklch(0.845 0.143 164.978)', 'chart-2': 'oklch(0.696 0.17 162.48)', 'chart-3': 'oklch(0.596 0.145 163.225)', 'chart-4': 'oklch(0.508 0.118 165.612)', 'chart-5': 'oklch(0.432 0.095 166.913)' },
  },
  fuchsia: {
    light: { 'chart-1': 'oklch(0.833 0.145 321.434)', 'chart-2': 'oklch(0.667 0.295 322.15)', 'chart-3': 'oklch(0.591 0.293 322.896)', 'chart-4': 'oklch(0.518 0.253 323.949)', 'chart-5': 'oklch(0.452 0.211 324.591)' },
    dark: { 'chart-1': 'oklch(0.833 0.145 321.434)', 'chart-2': 'oklch(0.667 0.295 322.15)', 'chart-3': 'oklch(0.591 0.293 322.896)', 'chart-4': 'oklch(0.518 0.253 323.949)', 'chart-5': 'oklch(0.452 0.211 324.591)' },
  },
  green: {
    light: { 'chart-1': 'oklch(0.871 0.15 154.449)', 'chart-2': 'oklch(0.723 0.219 149.579)', 'chart-3': 'oklch(0.627 0.194 149.214)', 'chart-4': 'oklch(0.527 0.154 150.069)', 'chart-5': 'oklch(0.448 0.119 151.328)' },
    dark: { 'chart-1': 'oklch(0.871 0.15 154.449)', 'chart-2': 'oklch(0.723 0.219 149.579)', 'chart-3': 'oklch(0.627 0.194 149.214)', 'chart-4': 'oklch(0.527 0.154 150.069)', 'chart-5': 'oklch(0.448 0.119 151.328)' },
  },
  lime: {
    light: { 'chart-1': 'oklch(0.897 0.196 126.665)', 'chart-2': 'oklch(0.768 0.233 130.85)', 'chart-3': 'oklch(0.648 0.2 131.684)', 'chart-4': 'oklch(0.532 0.157 131.589)', 'chart-5': 'oklch(0.453 0.124 130.933)' },
    dark: { 'chart-1': 'oklch(0.897 0.196 126.665)', 'chart-2': 'oklch(0.768 0.233 130.85)', 'chart-3': 'oklch(0.648 0.2 131.684)', 'chart-4': 'oklch(0.532 0.157 131.589)', 'chart-5': 'oklch(0.453 0.124 130.933)' },
  },
  indigo: {
    light: { 'chart-1': 'oklch(0.785 0.115 274.713)', 'chart-2': 'oklch(0.585 0.233 277.117)', 'chart-3': 'oklch(0.511 0.262 276.966)', 'chart-4': 'oklch(0.457 0.24 277.023)', 'chart-5': 'oklch(0.398 0.195 277.366)' },
    dark: { 'chart-1': 'oklch(0.785 0.115 274.713)', 'chart-2': 'oklch(0.585 0.233 277.117)', 'chart-3': 'oklch(0.511 0.262 276.966)', 'chart-4': 'oklch(0.457 0.24 277.023)', 'chart-5': 'oklch(0.398 0.195 277.366)' },
  },
  orange: {
    light: { 'chart-1': 'oklch(0.837 0.128 66.29)', 'chart-2': 'oklch(0.705 0.213 47.604)', 'chart-3': 'oklch(0.646 0.222 41.116)', 'chart-4': 'oklch(0.553 0.195 38.402)', 'chart-5': 'oklch(0.47 0.157 37.304)' },
    dark: { 'chart-1': 'oklch(0.837 0.128 66.29)', 'chart-2': 'oklch(0.705 0.213 47.604)', 'chart-3': 'oklch(0.646 0.222 41.116)', 'chart-4': 'oklch(0.553 0.195 38.402)', 'chart-5': 'oklch(0.47 0.157 37.304)' },
  },
  pink:{
    light: { 'chart-1': 'oklch(0.823 0.12 346.018)', 'chart-2': 'oklch(0.656 0.241 354.308)', 'chart-3': 'oklch(0.592 0.249 0.584)', 'chart-4': 'oklch(0.525 0.223 3.958)', 'chart-5': 'oklch(0.459 0.187 3.815)' },
    dark: { 'chart-1': 'oklch(0.823 0.12 346.018)', 'chart-2': 'oklch(0.656 0.241 354.308)', 'chart-3': 'oklch(0.592 0.249 0.584)', 'chart-4': 'oklch(0.525 0.223 3.958)', 'chart-5': 'oklch(0.459 0.187 3.815)' },
  },
  purple: {
    light: { 'chart-1': 'oklch(0.827 0.119 306.383)', 'chart-2': 'oklch(0.627 0.265 303.9)', 'chart-3': 'oklch(0.558 0.288 302.321)', 'chart-4': 'oklch(0.496 0.265 301.924)', 'chart-5': 'oklch(0.438 0.218 303.724)' },
    dark: { 'chart-1': 'oklch(0.827 0.119 306.383)', 'chart-2': 'oklch(0.627 0.265 303.9)', 'chart-3': 'oklch(0.558 0.288 302.321)', 'chart-4': 'oklch(0.496 0.265 301.924)', 'chart-5': 'oklch(0.438 0.218 303.724)' },
  },
  red: {
    light: { 'chart-1': 'oklch(0.808 0.114 19.571)', 'chart-2': 'oklch(0.637 0.237 25.331)', 'chart-3': 'oklch(0.577 0.245 27.325)', 'chart-4': 'oklch(0.505 0.213 27.518)', 'chart-5': 'oklch(0.444 0.177 26.899)' },
    dark: { 'chart-1': 'oklch(0.808 0.114 19.571)', 'chart-2': 'oklch(0.637 0.237 25.331)', 'chart-3': 'oklch(0.577 0.245 27.325)', 'chart-4': 'oklch(0.505 0.213 27.518)', 'chart-5': 'oklch(0.444 0.177 26.899)' },
  },
  rose: {
    light: { 'chart-1': 'oklch(0.81 0.117 11.638)', 'chart-2': 'oklch(0.645 0.246 16.439)', 'chart-3': 'oklch(0.586 0.253 17.585)', 'chart-4': 'oklch(0.514 0.222 16.935)', 'chart-5': 'oklch(0.455 0.188 13.697)' },
    dark: { 'chart-1': 'oklch(0.81 0.117 11.638)', 'chart-2': 'oklch(0.645 0.246 16.439)', 'chart-3': 'oklch(0.586 0.253 17.585)', 'chart-4': 'oklch(0.514 0.222 16.935)', 'chart-5': 'oklch(0.455 0.188 13.697)' },
  },
  sky: {
    light: { 'chart-1': 'oklch(0.809 0.105 251.813)', 'chart-2': 'oklch(0.623 0.214 259.815)', 'chart-3': 'oklch(0.546 0.245 262.881)', 'chart-4': 'oklch(0.488 0.243 264.376)', 'chart-5': 'oklch(0.424 0.199 265.638)' },
    dark: { 'chart-1': 'oklch(0.809 0.105 251.813)', 'chart-2': 'oklch(0.623 0.214 259.815)', 'chart-3': 'oklch(0.546 0.245 262.881)', 'chart-4': 'oklch(0.488 0.243 264.376)', 'chart-5': 'oklch(0.424 0.199 265.638)' },
  },
  teal: {
    light: { 'chart-1': 'oklch(0.855 0.138 181.071)', 'chart-2': 'oklch(0.704 0.14 182.503)', 'chart-3': 'oklch(0.6 0.118 184.704)', 'chart-4': 'oklch(0.511 0.096 186.391)', 'chart-5': 'oklch(0.437 0.078 188.216)' },
    dark: { 'chart-1': 'oklch(0.855 0.138 181.071)', 'chart-2': 'oklch(0.704 0.14 182.503)', 'chart-3': 'oklch(0.6 0.118 184.704)', 'chart-4': 'oklch(0.511 0.096 186.391)', 'chart-5': 'oklch(0.437 0.078 188.216)' },
  },
  violet: {
    light: { 'chart-1': 'oklch(0.811 0.111 293.571)', 'chart-2': 'oklch(0.606 0.25 292.717)', 'chart-3': 'oklch(0.541 0.281 293.009)', 'chart-4': 'oklch(0.491 0.27 292.581)', 'chart-5': 'oklch(0.432 0.232 292.759)' },
    dark: { 'chart-1': 'oklch(0.811 0.111 293.571)', 'chart-2': 'oklch(0.606 0.25 292.717)', 'chart-3': 'oklch(0.541 0.281 293.009)', 'chart-4': 'oklch(0.491 0.27 292.581)', 'chart-5': 'oklch(0.432 0.232 292.759)' },
  },
  yellow: {
    light: { 'chart-1': 'oklch(0.905 0.182 98.111)', 'chart-2': 'oklch(0.795 0.184 86.047)', 'chart-3': 'oklch(0.681 0.162 75.834)', 'chart-4': 'oklch(0.554 0.135 66.442)', 'chart-5': 'oklch(0.476 0.114 61.907)' },
    dark: { 'chart-1': 'oklch(0.905 0.182 98.111)', 'chart-2': 'oklch(0.795 0.184 86.047)', 'chart-3': 'oklch(0.681 0.162 75.834)', 'chart-4': 'oklch(0.554 0.135 66.442)', 'chart-5': 'oklch(0.476 0.114 61.907)' },
  },
};

// 主题 -> chart 配色映射
const themeChartMap: Record<string, string> = {
  zinc: 'neutral', slate: 'neutral',
  blue: 'blue', green: 'green', orange: 'orange',
  rose: 'rose', red: 'red', violet: 'violet', yellow: 'yellow',
  amber: 'amber', cyan: 'cyan', emerald: 'emerrald',
  fuchsia: 'fuchsia', lime: 'lime', indigo: 'indigo',
  pink: 'pink', purple: 'purple', sky: 'sky', teal: 'teal',
};

function buildVars(base: Record<string, string>, chart: Record<string, string>): Record<string, string> {
  const vars = { ...base, ...chart };
  // sidebar 从 base 派生
  return {
    ...vars,
    'sidebar-background': vars.card,
    'sidebar-foreground': vars['card-foreground'],
    'sidebar-primary': vars.primary,
    'sidebar-primary-foreground': vars['primary-foreground'],
    'sidebar-accent': vars.accent,
    'sidebar-accent-foreground': vars['accent-foreground'],
    'sidebar-border': vars.border,
    'sidebar-ring': vars.ring,
  };
}

const baseThemes: Record<Theme, { name: string; label: string; light: Record<string, string>; dark: Record<string, string> }> = {
  zinc: {
    name: 'zinc', label: '锌灰',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '240 5.9% 10%', 'primary-foreground': '0 0% 98%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '240 5.9% 10%',
    },
    dark: {
      background: '240 10% 3.9%', foreground: '0 0% 98%',
      card: '240 10% 3.9%', 'card-foreground': '0 0% 98%',
      popover: '240 10% 3.9%', 'popover-foreground': '0 0% 98%',
      primary: '0 0% 98%', 'primary-foreground': '240 5.9% 10%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '240 3.7% 15.9%', 'muted-foreground': '240 5% 64.9%',
      accent: '240 3.7% 15.9%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 0% 98%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '240 4.9% 83.9%',
    },
  },
  slate: {
    name: 'slate', label: '石板灰',
    light: {
      background: '0 0% 100%', foreground: '222.2 84% 4.9%',
      card: '0 0% 100%', 'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%', 'popover-foreground': '222.2 84% 4.9%',
      primary: '222.2 47.4% 11.2%', 'primary-foreground': '210 40% 98%',
      secondary: '210 40% 96.1%', 'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%', 'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%', 'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%', input: '214.3 31.8% 91.4%', ring: '222.2 84% 4.9%',
    },
    dark: {
      background: '222.2 84% 4.9%', foreground: '210 40% 98%',
      card: '222.2 84% 4.9%', 'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%', 'popover-foreground': '210 40% 98%',
      primary: '210 40% 98%', 'primary-foreground': '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%', 'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%', 'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%', 'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%', input: '217.2 32.6% 17.5%', ring: '212.7 26.8% 83.9%',
    },
  },
  blue: {
    name: 'blue', label: '蓝色',
    light: {
      background: '0 0% 100%', foreground: '222.2 84% 4.9%',
      card: '0 0% 100%', 'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%', 'popover-foreground': '222.2 84% 4.9%',
      primary: '221.2 83.2% 53.3%', 'primary-foreground': '210 40% 98%',
      secondary: '210 40% 96.1%', 'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%', 'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%', 'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%', input: '214.3 31.8% 91.4%', ring: '221.2 83.2% 53.3%',
    },
    dark: {
      background: '222.2 84% 4.9%', foreground: '210 40% 98%',
      card: '222.2 84% 4.9%', 'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%', 'popover-foreground': '210 40% 98%',
      primary: '217.2 91.2% 59.8%', 'primary-foreground': '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%', 'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%', 'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%', 'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%', input: '217.2 32.6% 17.5%', ring: '224.3 76.3% 48%',
    },
  },
  green: {
    name: 'green', label: '绿色',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '142.1 76.2% 36.3%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '142.1 76.2% 36.3%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '142.1 70.6% 45.3%', 'primary-foreground': '144.9 80.4% 10%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '142.4 71.8% 29.2%',
    },
  },
  orange: {
    name: 'orange', label: '橙色',
    light: {
      background: '0 0% 100%', foreground: '20 14.3% 4.1%',
      card: '0 0% 100%', 'card-foreground': '20 14.3% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '20 14.3% 4.1%',
      primary: '24.6 95% 53.1%', 'primary-foreground': '60 9.1% 97.8%',
      secondary: '60 4.8% 95.9%', 'secondary-foreground': '24 9.8% 10%',
      muted: '60 4.8% 95.9%', 'muted-foreground': '25 5.3% 44.7%',
      accent: '60 4.8% 95.9%', 'accent-foreground': '24 9.8% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '20 5.9% 90%', input: '20 5.9% 90%', ring: '24.6 95% 53.1%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '60 9.1% 97.8%',
      card: '20 14.3% 4.1%', 'card-foreground': '60 9.1% 97.8%',
      popover: '20 14.3% 4.1%', 'popover-foreground': '60 9.1% 97.8%',
      primary: '20.5 90.2% 48.2%', 'primary-foreground': '60 9.1% 97.8%',
      secondary: '12 6.5% 15.1%', 'secondary-foreground': '60 9.1% 97.8%',
      muted: '12 6.5% 15.1%', 'muted-foreground': '24 5.4% 63.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '60 9.1% 97.8%',
      destructive: '0 72.2% 50.6%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '12 6.5% 15.1%', input: '12 6.5% 15.1%', ring: '20.5 90.2% 48.2%',
    },
  },
  rose: {
    name: 'rose', label: '玫瑰红',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '346.8 77.2% 49.8%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '346.8 77.2% 49.8%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '346.8 77.2% 49.8%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '346.8 77.2% 49.8%',
    },
  },
  violet: {
    name: 'violet', label: '紫罗兰',
    light: {
      background: '0 0% 100%', foreground: '224 71.4% 4.1%',
      card: '0 0% 100%', 'card-foreground': '224 71.4% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '224 71.4% 4.1%',
      primary: '262.1 83.3% 57.8%', 'primary-foreground': '210 20% 98%',
      secondary: '220 14.3% 95.9%', 'secondary-foreground': '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%', 'muted-foreground': '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%', 'accent-foreground': '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 20% 98%',
      border: '220 13% 91%', input: '220 13% 91%', ring: '262.1 83.3% 57.8%',
    },
    dark: {
      background: '224 71.4% 4.1%', foreground: '210 20% 98%',
      card: '224 71.4% 4.1%', 'card-foreground': '210 20% 98%',
      popover: '224 71.4% 4.1%', 'popover-foreground': '210 20% 98%',
      primary: '263.4 70% 50.4%', 'primary-foreground': '210 20% 98%',
      secondary: '215 27.9% 16.9%', 'secondary-foreground': '210 20% 98%',
      muted: '215 27.9% 16.9%', 'muted-foreground': '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%', 'accent-foreground': '210 20% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 20% 98%',
      border: '215 27.9% 16.9%', input: '215 27.9% 16.9%', ring: '263.4 70% 50.4%',
    },
  },
  red: {
    name: 'red', label: '红色',
    light: {
      background: '0 0% 100%', foreground: '0 0% 3.9%',
      card: '0 0% 100%', 'card-foreground': '0 0% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '0 0% 3.9%',
      primary: '0 72.2% 50.6%', 'primary-foreground': '0 85.7% 97.3%',
      secondary: '0 0% 96.1%', 'secondary-foreground': '0 0% 9%',
      muted: '0 0% 96.1%', 'muted-foreground': '0 0% 45.1%',
      accent: '0 0% 96.1%', 'accent-foreground': '0 0% 9%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '0 0% 89.8%', input: '0 0% 89.8%', ring: '0 72.2% 50.6%',
    },
    dark: {
      background: '0 0% 3.9%', foreground: '0 0% 98%',
      card: '0 0% 3.9%', 'card-foreground': '0 0% 98%',
      popover: '0 0% 3.9%', 'popover-foreground': '0 0% 98%',
      primary: '0 72.2% 50.6%', 'primary-foreground': '0 85.7% 97.3%',
      secondary: '0 0% 14.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 14.9%', 'muted-foreground': '0 0% 63.9%',
      accent: '0 0% 14.9%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 0% 98%',
      border: '0 0% 14.9%', input: '0 0% 14.9%', ring: '0 72.2% 50.6%',
    },
  },
  yellow: {
    name: 'yellow', label: '黄色',
    light: {
      background: '0 0% 100%', foreground: '20 14.3% 4.1%',
      card: '0 0% 100%', 'card-foreground': '20 14.3% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '20 14.3% 4.1%',
      primary: '47.9 95.8% 53.1%', 'primary-foreground': '26 83.3% 14.1%',
      secondary: '60 4.8% 95.9%', 'secondary-foreground': '24 9.8% 10%',
      muted: '60 4.8% 95.9%', 'muted-foreground': '25 5.3% 44.7%',
      accent: '60 4.8% 95.9%', 'accent-foreground': '24 9.8% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '20 5.9% 90%', input: '20 5.9% 90%', ring: '20 14.3% 4.1%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '60 9.1% 97.8%',
      card: '20 14.3% 4.1%', 'card-foreground': '60 9.1% 97.8%',
      popover: '20 14.3% 4.1%', 'popover-foreground': '60 9.1% 97.8%',
      primary: '47.9 95.8% 53.1%', 'primary-foreground': '26 83.3% 14.1%',
      secondary: '12 6.5% 15.1%', 'secondary-foreground': '60 9.1% 97.8%',
      muted: '12 6.5% 15.1%', 'muted-foreground': '24 5.4% 63.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '60 9.1% 97.8%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '12 6.5% 15.1%', input: '12 6.5% 15.1%', ring: '35.5 91.7% 32.9%',
    },
  },
  // ===== 新增主题 =====
  amber: {
    name: 'amber', label: '琥珀',
    light: {
      background: '0 0% 100%', foreground: '20 14.3% 4.1%',
      card: '0 0% 100%', 'card-foreground': '20 14.3% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '20 14.3% 4.1%',
      primary: '38 92% 50%', 'primary-foreground': '26 83.3% 14.1%',
      secondary: '60 4.8% 95.9%', 'secondary-foreground': '24 9.8% 10%',
      muted: '60 4.8% 95.9%', 'muted-foreground': '25 5.3% 44.7%',
      accent: '60 4.8% 95.9%', 'accent-foreground': '24 9.8% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '20 5.9% 90%', input: '20 5.9% 90%', ring: '38 92% 50%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '60 9.1% 97.8%',
      card: '20 14.3% 4.1%', 'card-foreground': '60 9.1% 97.8%',
      popover: '20 14.3% 4.1%', 'popover-foreground': '60 9.1% 97.8%',
      primary: '38 92% 50%', 'primary-foreground': '26 83.3% 14.1%',
      secondary: '12 6.5% 15.1%', 'secondary-foreground': '60 9.1% 97.8%',
      muted: '12 6.5% 15.1%', 'muted-foreground': '24 5.4% 63.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '60 9.1% 97.8%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '60 9.1% 97.8%',
      border: '12 6.5% 15.1%', input: '12 6.5% 15.1%', ring: '38 92% 50%',
    },
  },
  cyan: {
    name: 'cyan', label: '青色',
    light: {
      background: '0 0% 100%', foreground: '222.2 84% 4.9%',
      card: '0 0% 100%', 'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%', 'popover-foreground': '222.2 84% 4.9%',
      primary: '189 94% 43%', 'primary-foreground': '0 0% 100%',
      secondary: '210 40% 96.1%', 'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%', 'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%', 'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%', input: '214.3 31.8% 91.4%', ring: '189 94% 43%',
    },
    dark: {
      background: '222.2 84% 4.9%', foreground: '210 40% 98%',
      card: '222.2 84% 4.9%', 'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%', 'popover-foreground': '210 40% 98%',
      primary: '189 94% 43%', 'primary-foreground': '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%', 'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%', 'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%', 'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%', input: '217.2 32.6% 17.5%', ring: '189 94% 43%',
    },
  },
  emerald: {
    name: 'emerald', label: '翡翠绿',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '160 84% 39%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '160 84% 39%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '160 84% 39%', 'primary-foreground': '144.9 80.4% 10%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '160 84% 39%',
    },
  },
  fuchsia: {
    name: 'fuchsia', label: '品红',
    light: {
      background: '0 0% 100%', foreground: '224 71.4% 4.1%',
      card: '0 0% 100%', 'card-foreground': '224 71.4% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '224 71.4% 4.1%',
      primary: '292 84% 61%', 'primary-foreground': '210 20% 98%',
      secondary: '220 14.3% 95.9%', 'secondary-foreground': '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%', 'muted-foreground': '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%', 'accent-foreground': '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 20% 98%',
      border: '220 13% 91%', input: '220 13% 91%', ring: '292 84% 61%',
    },
    dark: {
      background: '224 71.4% 4.1%', foreground: '210 20% 98%',
      card: '224 71.4% 4.1%', 'card-foreground': '210 20% 98%',
      popover: '224 71.4% 4.1%', 'popover-foreground': '210 20% 98%',
      primary: '292 84% 61%', 'primary-foreground': '210 20% 98%',
      secondary: '215 27.9% 16.9%', 'secondary-foreground': '210 20% 98%',
      muted: '215 27.9% 16.9%', 'muted-foreground': '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%', 'accent-foreground': '210 20% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 20% 98%',
      border: '215 27.9% 16.9%', input: '215 27.9% 16.9%', ring: '292 84% 61%',
    },
  },
  lime: {
    name: 'lime', label: '酸橙绿',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '84 81% 44%', 'primary-foreground': '0 0% 100%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '84 81% 44%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '84 81% 44%', 'primary-foreground': '0 0% 5%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '84 81% 44%',
    },
  },
  indigo: {
    name: 'indigo', label: '靛蓝',
    light: {
      background: '0 0% 100%', foreground: '224 71.4% 4.1%',
      card: '0 0% 100%', 'card-foreground': '224 71.4% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '224 71.4% 4.1%',
      primary: '239 84% 67%', 'primary-foreground': '210 20% 98%',
      secondary: '220 14.3% 95.9%', 'secondary-foreground': '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%', 'muted-foreground': '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%', 'accent-foreground': '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 20% 98%',
      border: '220 13% 91%', input: '220 13% 91%', ring: '239 84% 67%',
    },
    dark: {
      background: '224 71.4% 4.1%', foreground: '210 20% 98%',
      card: '224 71.4% 4.1%', 'card-foreground': '210 20% 98%',
      popover: '224 71.4% 4.1%', 'popover-foreground': '210 20% 98%',
      primary: '239 84% 67%', 'primary-foreground': '210 20% 98%',
      secondary: '215 27.9% 16.9%', 'secondary-foreground': '210 20% 98%',
      muted: '215 27.9% 16.9%', 'muted-foreground': '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%', 'accent-foreground': '210 20% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 20% 98%',
      border: '215 27.9% 16.9%', input: '215 27.9% 16.9%', ring: '239 84% 67%',
    },
  },
  pink: {
    name: 'pink', label: '粉色',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '330 81% 60%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '330 81% 60%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '330 81% 60%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '330 81% 60%',
    },
  },
  purple: {
    name: 'purple', label: '紫色',
    light: {
      background: '0 0% 100%', foreground: '224 71.4% 4.1%',
      card: '0 0% 100%', 'card-foreground': '224 71.4% 4.1%',
      popover: '0 0% 100%', 'popover-foreground': '224 71.4% 4.1%',
      primary: '271 91% 65%', 'primary-foreground': '210 20% 98%',
      secondary: '220 14.3% 95.9%', 'secondary-foreground': '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%', 'muted-foreground': '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%', 'accent-foreground': '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 20% 98%',
      border: '220 13% 91%', input: '220 13% 91%', ring: '271 91% 65%',
    },
    dark: {
      background: '224 71.4% 4.1%', foreground: '210 20% 98%',
      card: '224 71.4% 4.1%', 'card-foreground': '210 20% 98%',
      popover: '224 71.4% 4.1%', 'popover-foreground': '210 20% 98%',
      primary: '271 91% 65%', 'primary-foreground': '210 20% 98%',
      secondary: '215 27.9% 16.9%', 'secondary-foreground': '210 20% 98%',
      muted: '215 27.9% 16.9%', 'muted-foreground': '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%', 'accent-foreground': '210 20% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 20% 98%',
      border: '215 27.9% 16.9%', input: '215 27.9% 16.9%', ring: '271 91% 65%',
    },
  },
  sky: {
    name: 'sky', label: '天空蓝',
    light: {
      background: '0 0% 100%', foreground: '222.2 84% 4.9%',
      card: '0 0% 100%', 'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%', 'popover-foreground': '222.2 84% 4.9%',
      primary: '199 89% 48%', 'primary-foreground': '0 0% 100%',
      secondary: '210 40% 96.1%', 'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%', 'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%', 'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%', input: '214.3 31.8% 91.4%', ring: '199 89% 48%',
    },
    dark: {
      background: '222.2 84% 4.9%', foreground: '210 40% 98%',
      card: '222.2 84% 4.9%', 'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%', 'popover-foreground': '210 40% 98%',
      primary: '199 89% 48%', 'primary-foreground': '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%', 'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%', 'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%', 'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%', input: '217.2 32.6% 17.5%', ring: '199 89% 48%',
    },
  },
  teal: {
    name: 'teal', label: '蓝绿',
    light: {
      background: '0 0% 100%', foreground: '240 10% 3.9%',
      card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
      primary: '172 66% 50%', 'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
      accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '172 66% 50%',
    },
    dark: {
      background: '20 14.3% 4.1%', foreground: '0 0% 95%',
      card: '24 9.8% 10%', 'card-foreground': '0 0% 95%',
      popover: '0 0% 9%', 'popover-foreground': '0 0% 95%',
      primary: '172 66% 50%', 'primary-foreground': '144.9 80.4% 10%',
      secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%', 'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%', 'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%', 'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '172 66% 50%',
    },
  },
};

// Build final themes with per-theme chart colors + sidebar vars
export const themes: Record<Theme, ThemeConfig> = Object.fromEntries(
  Object.entries(baseThemes).map(([key, config]) => {
    const chartKey = themeChartMap[key] || 'neutral';
    const chart = chartColors[chartKey];
    return [key, {
      name: config.name,
      label: config.label,
      cssVars: {
        light: buildVars(config.light, chart.light),
        dark: buildVars(config.dark, chart.dark),
      },
    }];
  })
) as Record<Theme, ThemeConfig>;
