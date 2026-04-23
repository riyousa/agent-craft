import { useCallback, useRef, useEffect } from 'react';

/**
 * Hook that triggers a callback when user scrolls near the bottom.
 * Attaches to a ref container, or falls back to the nearest scrollable parent.
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  { enabled = true, threshold = 300 }: { enabled?: boolean; threshold?: number } = {}
) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: `${threshold}px` }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [enabled, threshold, onLoadMore]);

  return sentinelRef;
}
