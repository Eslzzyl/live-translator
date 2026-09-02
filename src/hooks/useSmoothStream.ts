import { useCallback, useEffect, useRef, useState } from "react";
import { splitGraphemes } from "../lib/graphemes";
import { advanceStream, reconcileStream } from "../lib/streamProgress";

export interface SmoothStreamOptions {
  enabled?: boolean;
  minIntervalMs?: number;
  startEmpty?: boolean;
  isFinal?: boolean;
}

type StreamTarget = {
  text: string;
  graphemes: string[];
};

export function useSmoothStream(
  targetText: string,
  options: SmoothStreamOptions = {},
): { displayedText: string; isComplete: boolean } {
  const { enabled = true, minIntervalMs = 60, startEmpty = true, isFinal = false } = options;
  const initialTarget = useRef<StreamTarget>({
    text: targetText,
    graphemes: splitGraphemes(targetText),
  });
  const initialDisplayed =
    !enabled || !startEmpty ? initialTarget.current.graphemes : ([] as string[]);
  const [displayedText, setDisplayedText] = useState(() => initialDisplayed.join(""));
  const displayedRef = useRef(initialDisplayed);
  const targetRef = useRef(initialTarget.current);
  const finalRef = useRef(isFinal);
  const frameIdRef = useRef<number | null>(null);
  const lastStepAtRef = useRef(0);

  const publish = useCallback((graphemes: string[]) => {
    displayedRef.current = graphemes;
    setDisplayedText(graphemes.join(""));
  }, []);

  const advance = useCallback(
    (timestamp: number) => {
      const target = targetRef.current;
      const current = displayedRef.current;

      const next = advanceStream(
        { graphemes: current, lastStepAt: lastStepAtRef.current },
        target.graphemes,
        timestamp,
        minIntervalMs,
        finalRef.current,
      );
      if (next.graphemes !== current) {
        publish(next.graphemes);
      }
      lastStepAtRef.current = next.lastStepAt;

      if (next.graphemes.length === target.graphemes.length) {
        frameIdRef.current = null;
        return;
      }

      frameIdRef.current = requestAnimationFrame(advance);
    },
    [minIntervalMs, publish],
  );

  const ensureRunning = useCallback(() => {
    if (frameIdRef.current === null && displayedRef.current.join("") !== targetRef.current.text) {
      lastStepAtRef.current = performance.now();
      frameIdRef.current = requestAnimationFrame(advance);
    }
  }, [advance]);

  useEffect(() => {
    finalRef.current = isFinal;
  }, [isFinal]);

  useEffect(() => {
    if (!enabled) {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      const target = splitGraphemes(targetText);
      targetRef.current = { text: targetText, graphemes: target };
      publish(target);
      return;
    }

    const target = splitGraphemes(targetText);
    targetRef.current = { text: targetText, graphemes: target };
    const reconciled = reconcileStream(
      { graphemes: displayedRef.current, lastStepAt: lastStepAtRef.current },
      target,
    );
    if (reconciled.graphemes !== displayedRef.current) {
      publish(reconciled.graphemes);
    }
    lastStepAtRef.current = reconciled.lastStepAt;
    ensureRunning();
  }, [enabled, ensureRunning, publish, targetText]);

  useEffect(
    () => () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    },
    [],
  );

  return { displayedText, isComplete: displayedText === targetText };
}
