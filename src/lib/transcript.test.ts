import { describe, expect, it } from "vitest";
import { formatTranscript, mergeTranscriptionSegment } from "./transcript";
import type { TranscriptionSegment } from "../types";

function segment(id: string, text: string, isFinal = true): TranscriptionSegment {
  return {
    id,
    session_id: 7,
    text,
    timestamp: "00:01",
    is_final: isFinal,
  };
}

describe("transcription transcript state", () => {
  it("replaces an interim segment without growing the history", () => {
    const interim = segment("transcription-1", "hello", false);
    const revised = segment("transcription-1", "hello world", false);
    const final = segment("transcription-1", "hello world");

    const next = mergeTranscriptionSegment(mergeTranscriptionSegment([interim], revised), final);

    expect(next).toEqual([final]);
  });

  it("keeps only the requested tail when the caption window consumes updates", () => {
    const entries = [segment("1", "one"), segment("2", "two"), segment("3", "three")];

    expect(
      mergeTranscriptionSegment(entries, segment("4", "four"), 3).map((item) => item.id),
    ).toEqual(["2", "3", "4"]);
  });

  it("exports transcription text without translation fields", () => {
    expect(formatTranscript([segment("1", "hello")], "transcription")).toBe("00:01\nhello");
  });
});
