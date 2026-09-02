import { useMemo } from "react";
import { splitGraphemes } from "../lib/graphemes";
import { useSmoothStream } from "../hooks/useSmoothStream";

export function SmoothText({
  text,
  isFinal = false,
  className = "",
  as: Component = "span",
}: {
  text: string;
  isFinal?: boolean;
  className?: string;
  as?: "span" | "p" | "div";
}) {
  const { displayedText, isComplete } = useSmoothStream(text, {
    minIntervalMs: 60,
    isFinal,
    startEmpty: !isFinal,
  });
  const tokens = useMemo(() => splitGraphemes(displayedText), [displayedText]);

  if (isComplete && isFinal) {
    return <Component className={`smooth-text-container ${className}`.trim()}>{text}</Component>;
  }

  return (
    <Component className={`smooth-text-container is-streaming ${className}`.trim()}>
      {tokens.map((token, index) => (
        <span key={`st-${index}-${token}`} className="subtitle-token subtitle-token-new">
          {token}
        </span>
      ))}
    </Component>
  );
}
