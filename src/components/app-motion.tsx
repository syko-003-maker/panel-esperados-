"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Briques d'animation de l'APPLICATION INSTALLÉE.
 *
 * Les styles qu'elles posent sont tous préfixés par `[data-display="app"]` :
 * dans un onglet de navigateur, ces composants ne changent donc rien du tout.
 * Chacune se dégrade proprement — sans JavaScript, ou avec `prefers-reduced-
 * motion`, le contenu reste entièrement lisible et rien ne disparaît.
 */

/** Respecte le réglage système « réduire les animations ». */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Fait apparaître son contenu quand il entre dans l'écran.
 *
 * L'observateur est débranché après le premier passage : une fois l'élément
 * apparu, il n'a plus aucune raison d'être surveillé, et ça évite de garder
 * des dizaines d'observateurs actifs sur une longue page.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Décalage en ms, pour faire arriver une grille en cascade. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Filet : sans IntersectionObserver, on affiche tout de suite.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setVisible(true);
          io.disconnect();
        }
      },
      // On déclenche un peu avant que l'élément touche le bas de l'écran :
      // l'animation a le temps de se jouer pendant que le lecteur arrive.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`app-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Alimente `--app-scroll` (parallaxe) et `--app-progress` (barre de lecture).
 *
 * Les deux valeurs sont écrites sur l'élément racine de la surface, pas dans
 * l'état React : un re-rendu à chaque pixel de défilement serait ruineux.
 * L'écriture est calée sur requestAnimationFrame pour ne pas dépasser la
 * fréquence d'affichage.
 */
export function ScrollDriver() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;

    // Les variables vivent sur <html>, la ou PwaSurface pose data-display.
    const root = document.documentElement;

    // L'espace membre fait défiler un conteneur interne, pas la fenêtre :
    // écouter `window` ne donnerait jamais rien. On retombe sur la fenêtre si
    // ce conteneur venait à disparaître.
    const scroller = document.querySelector<HTMLElement>("[data-app-scroll]");
    const target: HTMLElement | Window = scroller ?? window;

    let frame = 0;

    const update = () => {
      frame = 0;
      const y = scroller ? scroller.scrollTop : window.scrollY;
      const max = scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;

      // Parallaxe : plafonnée, sinon les couches de fond finissent par sortir
      // de l'écran sur les pages très longues.
      root.style.setProperty("--app-scroll", String(Math.min(y * 0.06, 90)));
      root.style.setProperty(
        "--app-progress",
        `${max > 0 ? Math.min((y / max) * 100, 100) : 0}%`
      );
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  return null;
}

/**
 * Carte en relief qui suit légèrement le curseur.
 *
 * L'inclinaison est volontairement faible (moins de 6°) : au-delà, le texte
 * devient flou sur certains écrans et l'effet passe du raffiné au gadget.
 */
export function TiltCard({
  children,
  className = "",
  featured = false,
}: {
  children: ReactNode;
  className?: string;
  /** Ajoute la lueur dorée réservée aux éléments mis en avant. */
  featured?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;

    el.style.transform = `translateY(-4px) rotateY(${px * 5.5}deg) rotateX(${-py * 5.5}deg)`;
  }

  function handleLeave() {
    const el = ref.current;
    if (el) el.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`app-card ${featured ? "app-card-featured" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
