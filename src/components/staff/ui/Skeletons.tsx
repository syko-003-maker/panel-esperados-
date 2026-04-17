import React from "react";
import { cn } from "@/lib/utils";
import { MotionSection } from "./motion";

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("h-4 rounded bg-white/8 animate-pulse", className)} />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <MotionSection className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.65),rgba(10,3,5,0.75))] p-6 space-y-3 shadow-[0_24px_60px_-38px_rgba(2,0,1,0.72)] backdrop-blur-xl">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </MotionSection>
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
