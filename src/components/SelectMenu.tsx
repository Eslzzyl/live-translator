import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

type SelectOption<T extends string> = readonly [T, string];

interface FloatingPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  minWidth: number;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(([optionValue]) => optionValue === value);
  const selected = options[selectedIndex >= 0 ? selectedIndex : 0];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 190 && spaceAbove > spaceBelow;
    const alignRight = rect.right > window.innerWidth / 2;

    setPosition({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: alignRight ? undefined : rect.left,
      right: alignRight ? window.innerWidth - rect.right : undefined,
      minWidth: Math.max(120, rect.width),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return undefined;
    }

    setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    updatePosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !optionsRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [open, selectedIndex, updatePosition]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < options.length) {
        onChange(options[focusedIndex][0]);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  const floatingStyle: CSSProperties = position
    ? {
        position: "fixed",
        top: position.top !== undefined ? `${position.top}px` : undefined,
        bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
        left: position.left !== undefined ? `${position.left}px` : undefined,
        right: position.right !== undefined ? `${position.right}px` : undefined,
        minWidth: `${position.minWidth}px`,
        zIndex: 1000,
      }
    : { display: "none" };

  return (
    <div className={`select-menu ${open ? "open" : ""} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.[1] ?? ""}</span>
        <ChevronDown size={14} className="select-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={optionsRef}
            className={`select-options select-floating-options ${className}`}
            style={floatingStyle}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
          >
            {options.map(([optionValue, label], index) => {
              const isSelected = optionValue === value;
              const isFocused = index === focusedIndex;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`select-option ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
                  key={optionValue}
                  onClick={() => {
                    onChange(optionValue);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <span>{label}</span>
                  {isSelected && <Check size={13} className="select-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
