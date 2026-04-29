/**
 * PageHeaderContext — coordinates app-level vs page-level top bars.
 *
 * The v3 design wants every redesigned page to render its own slim
 * top bar (面包屑 + subtitle + page-specific actions + theme toggle),
 * replacing the generic chrome the Layout draws. But not every page
 * has been migrated yet, so we want this to be opt-in.
 *
 * A page that adopts the new look mounts <PageHeader/> from
 * components/design, which calls `useHideAppHeader()` and tells the
 * Layout to skip its default header for the duration of that mount.
 * Pages that haven't been migrated keep getting the existing Layout
 * header automatically.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface PageHeaderState {
  hidden: boolean;
}

interface PageHeaderApi {
  state: PageHeaderState;
  hide: () => void;
  show: () => void;
}

const Ctx = createContext<PageHeaderApi | null>(null);

export const PageHeaderProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [hideCount, setHideCount] = useState(0);
  const api = useMemo<PageHeaderApi>(
    () => ({
      state: { hidden: hideCount > 0 },
      hide: () => setHideCount((n) => n + 1),
      show: () => setHideCount((n) => Math.max(0, n - 1)),
    }),
    [hideCount],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useAppHeaderState(): PageHeaderState {
  const ctx = useContext(Ctx);
  return ctx ? ctx.state : { hidden: false };
}

/**
 * Hook used by page-level <PageHeader/> components: increments the
 * "hidden" counter on mount and decrements on unmount, so multiple
 * page transitions don't fight over a boolean flag.
 */
export function useHideAppHeader(): void {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    ctx.hide();
    return () => ctx.show();
    // ctx.hide / ctx.show are stable for a given Provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
