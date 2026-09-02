const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function isReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function playLineEntrance(element: HTMLElement): Animation | null {
  if (typeof element.animate !== "function") return null;

  return element.animate(
    [
      { opacity: 0, transform: "translateY(22px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
  );
}
