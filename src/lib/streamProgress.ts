import { sharedPrefixLength } from "./graphemes";

export type StreamProgress = {
  graphemes: string[];
  lastStepAt: number;
};

function hasPrefix(prefix: readonly string[], text: readonly string[]) {
  return prefix.length <= text.length && sharedPrefixLength(prefix, text) === prefix.length;
}

function nextStepSize(lag: number) {
  return lag > 60 ? 2 : 1;
}

function nextIntervalMs(lag: number, minIntervalMs: number, isFinal: boolean) {
  if (lag > 60) return Math.max(40, Math.floor(minIntervalMs * 0.7));
  if (lag > 20 || isFinal) return Math.max(45, Math.floor(minIntervalMs * 0.85));
  return minIntervalMs;
}

export function reconcileStream(
  progress: StreamProgress,
  target: readonly string[],
): StreamProgress {
  if (hasPrefix(progress.graphemes, target)) return progress;
  return {
    ...progress,
    graphemes: progress.graphemes.slice(0, sharedPrefixLength(progress.graphemes, target)),
  };
}

export function advanceStream(
  progress: StreamProgress,
  target: readonly string[],
  timestamp: number,
  minIntervalMs: number,
  isFinal: boolean,
): StreamProgress {
  const reconciled = reconcileStream(progress, target);
  const lag = target.length - reconciled.graphemes.length;
  if (lag <= 0) return reconciled;
  if (timestamp - reconciled.lastStepAt < nextIntervalMs(lag, minIntervalMs, isFinal)) {
    return reconciled;
  }

  return {
    graphemes: target.slice(0, reconciled.graphemes.length + nextStepSize(lag)),
    lastStepAt: timestamp,
  };
}
