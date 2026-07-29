"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

type DatePickerProps = {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
};

const DAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function toLocalDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplay(iso: string): string {
  const d = toLocalDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // Monday = 0 … Sunday = 6
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DatePicker({ value, onChange, placeholder = "jj/mm/aaaa", required, className = "", id }: DatePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = toLocalDate(value);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() ?? today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync view when value changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
  }, [value]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function select(d: Date) {
    onChange(toISODate(d));
    setOpen(false);
  }

  const grid = buildGrid(viewYear, viewMonth);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Input trigger */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors
          ${open
            ? "border-amber-500/40 bg-[hsl(var(--sunset-surface)/0.9)] text-slate-100"
            : "border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] text-slate-100 hover:border-white/20"
          }
          ${!value ? "text-slate-500" : ""}
        `}
      >
        <span className={value ? "text-slate-100" : "text-slate-500"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>

      {/* Hidden native input for form submission / required */}
      <input
        type="hidden"
        value={value}
        required={required}
      />

      {/* Dropdown calendar */}
      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-full min-w-[252px] max-w-[300px] rounded-2xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.97)] shadow-[0_24px_60px_-12px_hsl(var(--sunset-surface2)/0.8)] backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-slate-100"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="text-sm font-semibold text-slate-100">
              {MONTHS[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-slate-100"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-white/6 px-2 pt-2 pb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-2 py-2">
            {grid.map((day, i) => {
              if (!day) return <div key={i} className="h-7" />;

              const isToday = day.getTime() === today.getTime();
              const isSelected = selectedDate && day.getTime() === selectedDate.getTime();
              const isPast = day.getTime() < today.getTime();

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => select(day)}
                  className={`
                    mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? "bg-[hsl(var(--sunset-magenta))] text-white shadow-[0_0_10px_-2px_hsl(var(--sunset-magenta)/0.5)]"
                      : isToday
                        ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : isPast
                          ? "text-slate-600 hover:bg-white/5 hover:text-slate-400"
                          : "text-slate-300 hover:bg-white/8 hover:text-slate-100"
                    }
                  `}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/6 px-3 py-2">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Effacer
            </button>
            <button
              type="button"
              onClick={() => { select(today); }}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              Aujourd'hui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
