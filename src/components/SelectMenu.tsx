import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SelectOption<T extends string> = readonly [T, string];

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
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find(([optionValue]) => optionValue === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`select-menu ${open ? "open" : ""} ${className}`}>
      <button
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.[1] ?? ""}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="select-options" role="listbox" aria-label={ariaLabel}>
          {options.map(([optionValue, label]) => (
            <button
              type="button"
              role="option"
              aria-selected={optionValue === value}
              className="select-option"
              key={optionValue}
              onClick={() => {
                onChange(optionValue);
                setOpen(false);
              }}
            >
              <span>{label}</span>
              {optionValue === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
