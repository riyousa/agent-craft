/**
 * Design system v3 — re-exports atoms used to compose every redesigned
 * page. See `design_update.md` Phase 0 for the inventory and rationale.
 *
 * Convention: callers import from `components/design`, not the individual
 * files, so we have one swap-point if we later collapse atoms or expose
 * Storybook fixtures.
 */
export { Pill } from './Pill';
export type { PillTone } from './Pill';
export { FileThumb } from './FileThumb';
export { PageTitle } from './PageTitle';
export { Toolbar } from './Toolbar';
export { StatCard } from './StatCard';
export { EmptyState } from './EmptyState';
