/**
 * Design system v3 — re-exports atoms used to compose every redesigned
 * page. v3 design system — atoms documented inline in each file.
 *
 * Convention: callers import from `components/design`, not the individual
 * files, so we have one swap-point if we later collapse atoms or expose
 * Storybook fixtures.
 */
export { Pill } from './Pill';
export type { PillTone } from './Pill';
export { FileThumb } from './FileThumb';
export { PageHeader } from './PageHeader';
export { PageTitle } from './PageTitle';
export { Toolbar } from './Toolbar';
export { StatCard } from './StatCard';
export { EmptyState } from './EmptyState';
export { H2 } from './H2';
export { Field } from './Field';
export { AutoGrowTextarea } from './AutoGrowTextarea';
export { TablePagination } from './TablePagination';
