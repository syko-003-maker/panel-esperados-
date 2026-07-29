"use client";

import { useEffect, useRef, useState } from "react";

export type SeriesPoint = { t: number; v: number };

const PAD = { top: 14, right: 16, bottom: 24, left: 54 };

/**
 * Courbe d'évolution en SVG pur (aucune lib externe) : aire dégradée + ligne,
 * grille horizontale, ligne du zéro optionnelle, survol interactif.
 *
 * Hauteur FIXE (compacte) + largeur mesurée par ResizeObserver → viewBox 1:1
 * (aucune distortion, ne "gonfle" pas sur les grands écrans). Thème sombre.
 */
export function TrendChart({
  points,
  color = "#34d399",
  height = 180,
  formatValue,
  formatValueShort,
  formatDate,
  formatDateFull,
  zeroLine = false,
  emptyLabel = "Pas encore assez de données pour tracer une courbe.",
}: {
  points: SeriesPoint[];
  color?: string;
  height?: number;
  formatValue: (v: number) => string;
  formatValueShort?: (v: number) => string;
  formatDate: (t: number) => string;
  formatDateFull?: (t: number) => string;
  zeroLine?: boolean;
  emptyLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(680);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    setW(Math.round(el.clientWidth || 680));
    return () => ro.disconnect();
  }, []);

  if (!points || points.length < 2) {
    return (
      <div
        ref={wrapRef}
        className="flex items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] px-6 text-center text-sm text-slate-500"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const H = height;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (zeroLine) {
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.14;
  minY -= padY;
  maxY += padY;

  const plotW = w - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const sx = (t: number) => PAD.left + ((t - minX) / (maxX - minX || 1)) * plotW;
  const sy = (v: number) => PAD.top + (1 - (v - minY) / (maxY - minY || 1)) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`)
    .join(" ");
  const baseY = sy(minY);
  const areaPath = `${linePath} L${sx(maxX).toFixed(1)},${baseY.toFixed(1)} L${sx(minX).toFixed(1)},${baseY.toFixed(1)} Z`;

  const yTicks = 3;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);
  const zeroY = zeroLine && minY < 0 && maxY > 0 ? sy(0) : null;
  const fmtShort = formatValueShort ?? formatValue;
  const gid = `tc-grad-${color.replace(/[^a-z0-9]/gi, "")}`;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xVB = ((e.clientX - rect.left) / (rect.width || 1)) * w;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(sx(points[i].t) - xVB);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${H}`}
        width={w}
        height={H}
        className="block max-w-full select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tk, i) => {
          const y = sy(tk);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={w - PAD.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill="rgba(148,163,184,0.72)">
                {fmtShort(tk)}
              </text>
            </g>
          );
        })}

        {zeroY != null && (
          <line
            x1={PAD.left}
            y1={zeroY}
            x2={w - PAD.right}
            y2={zeroY}
            stroke="rgba(226,232,240,0.4)"
            strokeWidth={1.25}
            strokeDasharray="5 5"
          />
        )}

        <path d={areaPath} fill={`url(#${gid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((idx, i) => (
          <text
            key={i}
            x={Math.min(Math.max(sx(points[idx].t), PAD.left + 18), w - PAD.right - 18)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            fontSize={11}
            fill="rgba(148,163,184,0.68)"
          >
            {formatDate(points[idx].t)}
          </text>
        ))}

        {hp && (
          <g>
            <line x1={sx(hp.t)} y1={PAD.top} x2={sx(hp.t)} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
            <circle cx={sx(hp.t)} cy={sy(hp.v)} r={4.5} fill={color} stroke="#0b0407" strokeWidth={2.5} />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/12 bg-[hsl(var(--sunset-surface)/0.94)] px-2.5 py-1 text-center shadow-lg"
          style={{ left: `${(sx(hp.t) / w) * 100}%` }}
        >
          <div className="text-xs font-semibold tabular-nums text-slate-100">{formatValue(hp.v)}</div>
          <div className="text-[10px] text-slate-400">{(formatDateFull ?? formatDate)(hp.t)}</div>
        </div>
      )}
    </div>
  );
}
