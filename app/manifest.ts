import type { MetadataRoute } from "next";

/**
 * Manifeste PWA — rend le panel installable (icône écran d'accueil, plein
 * écran). Next génère /manifest.webmanifest et ajoute le <link> automatiquement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Los Esperados — Panel",
    short_name: "Los Esperados",
    description: "Panel de la famille Los Esperados (LYG) — membres, banque, sanctions, règlement.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060406",
    theme_color: "#9b2335",
    lang: "fr",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
