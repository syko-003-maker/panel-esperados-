"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";

/**
 * Initialise Lenis sur l'élément <main data-scroll-container> du staff layout.
 * — Wrapper ciblé : ne casse pas le scroll des inputs, modales, dropdowns
 * — Respecte prefers-reduced-motion : Lenis n'est pas activé si l'utilisateur le demande
 * — Cleanup propre (raf + destroy) au démontage
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReducedMotion.matches) return;

    const wrapper = document.querySelector<HTMLElement>("[data-lenis-root]");
    const content = wrapper?.firstElementChild as HTMLElement | null;
    if (!wrapper || !content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      duration: 1.05,
      // Easing premium : approche douce vers la fin, pas de rebond
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      lerp: 0.1,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
