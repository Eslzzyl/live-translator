import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type UIEvent,
} from "react";

export type VirtualItem = {
  index: number;
  key: string;
  start: number;
  size: number;
};

type Viewport = {
  height: number;
  scrollTop: number;
};

function findRowAt(offsets: number[], position: number) {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= position) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function useVirtualList<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  estimateSize = 76,
  overscan = 6,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const observers = useRef(new Map<string, ResizeObserver>());
  const callbacks = useRef(new Map<string, RefCallback<HTMLElement>>());
  const [viewport, setViewport] = useState<Viewport>({ height: 0, scrollTop: 0 });
  const [measurementVersion, setMeasurementVersion] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateViewport = () => {
      setViewport({ height: container.clientHeight, scrollTop: container.scrollTop });
    };
    updateViewport();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewport);
      return () => window.removeEventListener("resize", updateViewport);
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const activeKeys = new Set(items.map(getKey));
    for (const key of heights.current.keys()) {
      if (!activeKeys.has(key)) heights.current.delete(key);
    }
    for (const [key, observer] of observers.current) {
      if (!activeKeys.has(key)) {
        observer.disconnect();
        observers.current.delete(key);
        callbacks.current.delete(key);
      }
    }
  }, [items, getKey]);

  const measureRef = useCallback((key: string): RefCallback<HTMLElement> => {
    const existing = callbacks.current.get(key);
    if (existing) return existing;

    const callback: RefCallback<HTMLElement> = (element) => {
      observers.current.get(key)?.disconnect();
      observers.current.delete(key);

      if (!element) return;

      const updateSize = (size: number) => {
        if (!Number.isFinite(size) || size <= 0 || heights.current.get(key) === size) return;
        heights.current.set(key, size);
        setMeasurementVersion((version) => version + 1);
      };

      updateSize(element.getBoundingClientRect().height);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(([entry]) => {
          const borderBox = Array.isArray(entry.borderBoxSize)
            ? entry.borderBoxSize[0]
            : entry.borderBoxSize;
          updateSize(borderBox?.blockSize ?? entry.contentRect.height);
        });
        observer.observe(element);
        observers.current.set(key, observer);
      }
    };
    callbacks.current.set(key, callback);
    return callback;
  }, []);

  const layout = useMemo(() => {
    const offsets = [0];
    const rows: VirtualItem[] = [];
    let start = 0;

    for (let index = 0; index < items.length; index += 1) {
      const key = getKey(items[index]);
      const size = heights.current.get(key) ?? estimateSize;
      rows.push({ index, key, start, size });
      start += size;
      offsets.push(start);
    }

    return { offsets, rows, totalSize: start };
  }, [estimateSize, getKey, items, measurementVersion]);

  const virtualItems = useMemo(() => {
    if (layout.rows.length === 0) return [];

    const first = Math.max(0, findRowAt(layout.offsets, viewport.scrollTop) - overscan);
    const last = Math.min(
      layout.rows.length,
      findRowAt(layout.offsets, viewport.scrollTop + Math.max(viewport.height, estimateSize)) +
        overscan +
        1,
    );
    return layout.rows.slice(first, Math.max(first + 1, last));
  }, [estimateSize, layout, overscan, viewport]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
  }, []);

  return {
    containerRef,
    handleScroll,
    measureRef,
    totalSize: layout.totalSize,
    virtualItems,
  };
}
