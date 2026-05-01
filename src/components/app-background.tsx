"use client";

import { useEffect, useRef } from "react";

/**
 * Global animated background — v9 Particles + Fast Orb + Shimmer.
 *
 * Layers (bas → haut) :
 *  1. app-bg-base      — gradient sombre directionnel
 *  2. app-bg-halo-1/2  — orbs rouge/bordeaux rapides (4-8s)
 *  3. ParticleCanvas   — petites particules flottantes rouges (canvas)
 *  4. app-bg-shimmer   — shimmer diagonal lent
 *  5. app-bg-sweep     — balayage lumineux diagonal, cycle 16s
 *  6. app-bg-vignette  — bords assombris
 */

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    // 55 particules flottantes
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      baseOpacity: Math.random() * 0.35 + 0.08,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.008 + Math.random() * 0.018,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const alpha = p.baseOpacity * (0.55 + 0.45 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(215, 38, 62, ${alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.65 }}
    />
  );
}

export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true" data-ui="app-background-v9">
      <div className="app-bg-base" />
      <div className="app-bg-halo app-bg-halo-1" />
      <div className="app-bg-halo app-bg-halo-2" />
      <ParticleCanvas />
      <div className="app-bg-shimmer" />
      <div className="app-bg-sweep" />
      <div className="app-bg-vignette" />
    </div>
  );
}
