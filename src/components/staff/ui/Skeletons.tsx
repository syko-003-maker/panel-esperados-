import React from "react";
import { cn } from "@/lib/utils";

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("h-4 bg-slate-800/50 rounded animate-pulse", className)} />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonRow key={`header-${i}`} className="h-6" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <SkeletonRow key={`row-${rowIdx}-col-${colIdx}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
