"use client";

/**
 * Global animated background — v8 Vivid Neon Grid.
 *
 * Layers (bas → haut) :
 *  1. app-bg-base        — gradient sombre directionnel
 *  2. app-bg-halo-1/2/3  — halos rouge/bordeaux en mouvement réel (transform GPU)
 *  3. app-bg-grid-glow   — grille diagonale large + blur = aura néon, pulse
 *  4. app-bg-grid        — lignes fines nettes, mask diagonal pour variation
 *  5. app-bg-sweep       — balayage lumineux diagonal, cycle 16s
 *  6. app-bg-vignette    — bords assombris
 */
export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true" data-ui="app-background-v8">
      <div className="app-bg-base" />
      <div className="app-bg-halo app-bg-halo-1" />
      <div className="app-bg-halo app-bg-halo-2" />
      <div className="app-bg-halo app-bg-halo-3" />
      <div className="app-bg-grid-glow" />
      <div className="app-bg-grid" />
      <div className="app-bg-sweep" />
      <div className="app-bg-vignette" />
    </div>
  );
}
