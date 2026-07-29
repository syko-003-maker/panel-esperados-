"use client";

import { ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type StyledSelectProps = {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
};

export function StyledSelect({
  value,
  onChange,
  children,
  className = "",
  disabled,
  id,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Hydration safe portal
  useEffect(() => { setMounted(true); }, []);

  // Extraire les options depuis les children <option>
  const options: { value: string; label: React.ReactNode }[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const el = child as ReactElement<{ value?: string | number; children?: React.ReactNode }>;
      options.push({
        value: String(el.props.value ?? ""),
        label: el.props.children,
      });
    }
  });

  const currentValue = String(value ?? "");
  const selected = options.find((o) => o.value === currentValue);
  const displayLabel = selected?.label ?? options[0]?.label ?? "";

  // Calculer la position du dropdown via getBoundingClientRect
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: rect.width,
      zIndex: 9999,
    });
  }, [open]);

  // Fermer au clic extérieur ou au scroll
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest("[data-styled-select-dropdown]")
      ) {
        setOpen(false);
      }
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function select(val: string) {
    onChange?.({ target: { value: val } });
    setOpen(false);
  }

  const dropdown = (
    <div
      data-styled-select-dropdown
      style={dropdownStyle}
      className="overflow-hidden rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.97)] shadow-[0_16px_48px_-8px_hsl(var(--sunset-surface2)/0.8)] backdrop-blur-sm"
    >
      {options.map((opt) => {
        const isSelected = opt.value === currentValue;
        return (
          <button
            key={opt.value}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(opt.value)}
            className={[
              "flex w-full items-center px-3 py-2 text-sm transition-colors text-left whitespace-nowrap",
              isSelected
                ? "bg-amber-500/15 text-amber-200 font-medium"
                : "text-slate-300 hover:bg-white/[0.06] hover:text-slate-100",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={[
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-all",
          open
            ? "border-amber-500/40 bg-[hsl(var(--sunset-surface)/0.95)] text-slate-100"
            : "border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] text-slate-100 hover:border-white/20 hover:bg-[hsl(var(--sunset-surface)/0.9)]",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  );
}

StyledSelect.displayName = "StyledSelect";
