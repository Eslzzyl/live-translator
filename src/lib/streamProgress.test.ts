import { describe, expect, it } from "vitest";
import { splitGraphemes } from "./graphemes";
import { advanceStream, reconcileStream, type StreamProgress } from "./streamProgress";

const INTERVAL_MS = 26;

function replay(progress: StreamProgress, targetText: string, timestamp: number, isFinal = false) {
  return advanceStream(progress, splitGraphemes(targetText), timestamp, INTERVAL_MS, isFinal);
}

describe("stream progress replay", () => {
  it("reveals a delayed translation in grapheme order", () => {
    let progress: StreamProgress = { graphemes: [], lastStepAt: 0 };
    progress = replay(progress, "你好", 26);
    expect(progress.graphemes.join("")).toBe("你");

    progress = replay(progress, "你好", 52);
    expect(progress.graphemes.join("")).toBe("你好");
  });

  it("keeps progress while later packets extend the same turn", () => {
    let progress: StreamProgress = { graphemes: [], lastStepAt: 0 };
    progress = replay(progress, "Hello", 26);
    expect(progress.graphemes.join("")).toBe("H");

    progress = replay(progress, "Hello world", 52);
    expect(progress.graphemes.join("")).toBe("He");
  });

  it("retains the common prefix when an interim transcript is corrected", () => {
    const progress: StreamProgress = { graphemes: splitGraphemes("hello"), lastStepAt: 100 };
    const corrected = reconcileStream(progress, splitGraphemes("help"));
    expect(corrected.graphemes.join("")).toBe("hel");
  });

  it("keeps a long final translation readable while catching up", () => {
    const target = "实时字幕".repeat(24);
    const progress = replay({ graphemes: [], lastStepAt: 0 }, target, 40, true);
    expect(progress.graphemes.length).toBe(2);
    expect(target.startsWith(progress.graphemes.join(""))).toBe(true);
  });
});
