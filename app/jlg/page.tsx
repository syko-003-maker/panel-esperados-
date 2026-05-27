import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";

// Détecte l'affiche, peu importe son extension (png / jpg / jpeg / webp).
// On vérifie au render — si tu la remplaces sans rebuild, le prochain hit
// utilise le nouveau fichier. Renvoie le chemin web ou null.
function findPoster(): string | null {
  const dir = path.join(process.cwd(), "public/jlg");
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const file = `affiche.${ext}`;
    if (fs.existsSync(path.join(dir, file))) {
      return `/jlg/${file}`;
    }
  }
  return null;
}
import {
  Crown,
  Key,
  Network,
  Workflow,
  Users,
  Flame,
  Brain,
  Target,
  Gem,
  Handshake,
  Music,
  Compass,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Technique J.L.G — Los Esperados",
  description:
    "Plus on construit ensemble, plus on monte haut. Le mouvement des Los motivés.",
  openGraph: {
    title: "Technique J.L.G — Los Esperados",
    description: "Plus on construit ensemble, plus on monte haut.",
    images: [findPoster() ?? "/branding/los-esperados.png"],
    type: "website",
  },
};


// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

const PILLARS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Workflow, label: "Une bonne\norganisation" },
  { icon: Users, label: "De la\nprésence" },
  { icon: Flame, label: "De la\nmotivation" },
  { icon: Brain, label: "Et une mentalité\nsérieuse" },
];

const VALUES: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Gem, label: "Luxe" },
  { icon: Handshake, label: "Respect" },
  { icon: Music, label: "Musique" },
  { icon: Compass, label: "Stratégie" },
  { icon: Trophy, label: "Mentalité\ngagnante" },
];

// ---------------------------------------------------------------------------
// Sous-composants visuels
// ---------------------------------------------------------------------------

/** Séparateur ornemental "filigrane" : trait gold + losange central + trait. */
function Flourish({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-4 py-2" aria-hidden>
      <svg width={wide ? 80 : 56} height={10} viewBox="0 0 80 10">
        <defs>
          <linearGradient id="gold-fade-l" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <line x1="0" y1="5" x2="80" y2="5" stroke="url(#gold-fade-l)" strokeWidth="1" />
        <circle cx="76" cy="5" r="1.2" fill="#d4af37" />
      </svg>
      <span
        className="inline-block h-2.5 w-2.5 rotate-45"
        style={{
          background: "linear-gradient(140deg, #f5e1a8, #d4af37 50%, #a47d20)",
          boxShadow: "0 0 12px rgba(212,175,55,0.7), inset 0 0 4px rgba(255,255,255,0.4)",
        }}
      />
      <svg width={wide ? 80 : 56} height={10} viewBox="0 0 80 10">
        <defs>
          <linearGradient id="gold-fade-r" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="5" x2="80" y2="5" stroke="url(#gold-fade-r)" strokeWidth="1" />
        <circle cx="4" cy="5" r="1.2" fill="#d4af37" />
      </svg>
    </div>
  );
}

/** Coin ornemental — petit triangle stylisé en or pour les angles des cartes. */
function CornerOrnament({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const placement = {
    tl: "top-2 left-2 rotate-0",
    tr: "top-2 right-2 rotate-90",
    bl: "bottom-2 left-2 -rotate-90",
    br: "bottom-2 right-2 rotate-180",
  }[pos];
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 22 22"
      className={`absolute ${placement} text-[#d4af37]/65`}
    >
      <path
        d="M2 2 L8 2 M2 2 L2 8 M2 2 L6 6"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Texte avec effet "or gravé" — gradient + glow doux. */
function Gold({
  children,
  className = "",
  serif = true,
}: {
  children: React.ReactNode;
  className?: string;
  serif?: boolean;
}) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, #fff2c2 0%, #f5d76e 22%, #d4af37 50%, #b8860b 78%, #6e5111 100%)",
        WebkitTextStroke: "0.3px rgba(255, 220, 140, 0.15)",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6)) drop-shadow(0 0 18px rgba(212,175,55,0.25))",
        fontFamily: serif ? "var(--font-cinzel), Georgia, serif" : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** Carte avec frame ornementale or + coins gravés. */
function OrnateCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          // Double bordure : externe or, interne ombre noire (effet "cadre encadré")
          background: "linear-gradient(180deg, rgba(10,3,3,0.94), rgba(6,1,2,0.97))",
          border: "1px solid rgba(212,175,55,0.30)",
          boxShadow:
            "0 30px 80px -30px rgba(212,175,55,0.18), inset 0 0 0 1px rgba(212,175,55,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Liseré or supérieur fin (rappel poster) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/55 to-transparent" />
        {/* Coins gravés */}
        <CornerOrnament pos="tl" />
        <CornerOrnament pos="tr" />
        <CornerOrnament pos="bl" />
        <CornerOrnament pos="br" />
        {children}
      </div>
    </div>
  );
}

/** Icône dans une rondelle or — bordure plus marquée, plus lumineuse. */
function GoldDisc({ Icon, size = 26 }: { Icon: LucideIcon; size?: number }) {
  return (
    <div
      className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl"
      style={{
        background:
          "radial-gradient(circle at 30% 25%, rgba(255,230,160,0.32), rgba(122,31,43,0.20) 60%, rgba(0,0,0,0.6))",
        border: "1px solid rgba(212,175,55,0.55)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px -10px rgba(212,175,55,0.55), 0 0 0 2px rgba(0,0,0,0.6), 0 0 0 3px rgba(212,175,55,0.18)",
      }}
    >
      <Icon size={size} strokeWidth={1.5} className="text-[#f5d76e] drop-shadow-[0_0_6px_rgba(212,175,55,0.55)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function JlgPage() {
  const posterSrc = findPoster();

  return (
    <main
      className="relative min-h-screen overflow-x-hidden text-slate-200"
      style={{
        background:
          // Fond noir profond avec halos bordeaux et or, pour matcher l'affiche.
          "radial-gradient(circle at 50% -10%, rgba(212,175,55,0.13) 0%, transparent 55%), radial-gradient(circle at 18% 32%, rgba(122,31,43,0.22) 0%, transparent 50%), radial-gradient(circle at 82% 70%, rgba(122,31,43,0.18) 0%, transparent 55%), radial-gradient(circle at 50% 110%, rgba(212,175,55,0.10) 0%, transparent 50%), linear-gradient(180deg, #050102 0%, #0a0304 60%, #050102 100%)",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════
          AMBIANCE : l'affiche en fond, fortement assombrie & floutée.
          On l'utilise NON comme hero (ça créait une duplication visuelle
          avec le contenu textuel ci-dessous), mais comme atmosphère :
          on devine la couronne, le squelette, la bouteille de tequila
          derrière la voile noire, sans que ça vole la vedette au texte.
          ════════════════════════════════════════════════════════════════ */}
      {posterSrc ? (
        <>
          {/* Image fixée à droite (desktop) / en haut (mobile) */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0"
            style={{ overflow: "hidden" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterSrc}
              alt=""
              className="h-full w-full object-cover"
              style={{
                opacity: 0.18,
                filter: "blur(6px) saturate(0.9)",
                transform: "scale(1.05)",
              }}
            />
          </div>
          {/* Voile noir + radial bordeaux/or PAR-DESSUS l'affiche */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.95) 100%), radial-gradient(circle at 50% 0%, rgba(212,175,55,0.10) 0%, transparent 50%)",
            }}
          />
        </>
      ) : null}

      {/* Film grain (donne du "vieux papier / cuir" à toute la page) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Texture filigrane discrète */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(212,175,55,1) 1px, transparent 1px), linear-gradient(-45deg, rgba(212,175,55,1) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      {/* Bandeau drapeau Mexique discret (rappel poster) — barre fine en haut */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-[#006847] via-white to-[#ce1126]" />

      <div className="relative z-20 mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        {/* ════════════════════════ HERO ÉMBLÈME ════════════════════════
            Un seul hero, fidèle au TOP de l'affiche : couronne dorée
            + "LOS ESPERADOS" gravé en or + "ROYAL CLUB" en sous-titre,
            avec un halo lumineux pour évoquer le drapeau Mexique.
            ════════════════════════════════════════════════════════════════ */}
        <section className="flex flex-col items-center text-center">
          {/* Halo drapeau Mexique en arrière-plan (vert/blanc/rouge fondus) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-80 w-[640px] max-w-full -translate-x-1/2 opacity-25 blur-2xl"
            style={{
              background:
                "linear-gradient(90deg, #006847 0%, #f8f8f8 50%, #ce1126 100%)",
            }}
          />

          {/* Couronne gold géante */}
          <div className="relative mb-5">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(212,175,55,0.45) 0%, transparent 70%)" }}
            />
            <Crown
              size={92}
              strokeWidth={1.3}
              className="drop-shadow-[0_8px_28px_rgba(212,175,55,0.65)]"
              style={{ color: "#f5d76e" }}
            />
          </div>

          {/* Titre principal "LOS ESPERADOS" — façon plaque dorée */}
          <h1
            className="text-5xl leading-[0.95] sm:text-7xl md:text-[5.5rem]"
            style={{
              fontFamily: "var(--font-cinzel), Georgia, serif",
              fontWeight: 900,
              letterSpacing: "0.02em",
            }}
          >
            <Gold>LOS ESPERADOS</Gold>
          </h1>

          {/* Filigrane décoratif */}
          <div className="mt-6 w-full max-w-sm">
            <Flourish wide />
          </div>
        </section>

        {/* ════════════════════ APERÇU AFFICHE — TIMBRE ════════════════════
            Un petit médaillon (clipable rond) qui MONTRE l'affiche réduite
            façon "sceau / timbre", sans la dupliquer en taille géante.
            ════════════════════════════════════════════════════════════════ */}
        {posterSrc ? (
          <div className="mt-10 flex justify-center">
            <a
              href={posterSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block"
              aria-label="Voir l'affiche en grand"
            >
              {/* Cadre or "médaille" */}
              <div
                className="relative h-32 w-24 overflow-hidden rounded-2xl transition-transform duration-500 group-hover:scale-[1.03]"
                style={{
                  padding: "3px",
                  background:
                    "linear-gradient(135deg, #f5d76e 0%, #d4af37 30%, #6e5111 55%, #d4af37 80%, #f5d76e 100%)",
                  boxShadow:
                    "0 25px 60px -20px rgba(212,175,55,0.55), 0 0 0 2px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.15)",
                }}
              >
                <div className="h-full w-full overflow-hidden rounded-[14px] ring-1 ring-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={posterSrc}
                    alt="Affiche Technique J.L.G"
                    className="h-full w-full object-cover"
                    loading="eager"
                  />
                </div>
              </div>
              {/* Badge "Affiche officielle" sous la médaille */}
              <span
                className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.3em] text-[#d4af37]/80"
                style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
              >
                Affiche officielle ↗
              </span>
            </a>
          </div>
        ) : null}

        {/* ────────────────────── TITRE SECTION ────────────────────── */}
        <section className={`text-center ${posterSrc ? "mt-20" : "mt-14"}`}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-[#d4af37]/80">
            Los Esperados · Présente
          </p>
          <h2
            className="text-5xl leading-none sm:text-6xl md:text-7xl"
            style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontWeight: 800, letterSpacing: "0.04em" }}
          >
            <Gold>TECHNIQUE</Gold>
          </h2>
          <h2
            className="-mt-1 text-5xl italic leading-none sm:text-6xl md:text-7xl"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700, letterSpacing: "0.02em" }}
          >
            <Gold serif={false}>J.L.G</Gold>
          </h2>
          <Flourish wide />
          <p
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}
          >
            <span className="font-semibold text-[#f5d76e]">Les gars, j'vous explique le concept simplement.</span>
            <br />
            Le but de la Technique J.L.G, c'est de permettre à tous les Los qui veulent
            augmenter leur capital de se réunir et construire quelque chose de rentable
            ensemble.
          </p>
        </section>

        {/* ────────────────────── L'IDÉE EST SIMPLE ────────────────────── */}
        <section className="mt-14">
          <OrnateCard>
            <div className="flex items-start gap-5 p-7 sm:p-8">
              <GoldDisc Icon={Key} />
              <div className="min-w-0 flex-1 pt-1">
                <h3
                  className="mb-3 text-xl font-bold uppercase tracking-[0.18em]"
                  style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
                >
                  <Gold>L'idée est simple :</Gold>
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-300">
                  Chacun participe à sa manière, chacun pose ses{" "}
                  <strong className="text-[#f5d76e]">printers</strong>, on organise des{" "}
                  <strong className="text-[#f5d76e]">roulements toutes les 10 minutes</strong>{" "}
                  pour garder une bonne organisation, et plus il y a de monde qui
                  participe, plus l'argent monte rapidement.
                </p>
              </div>
            </div>
          </OrnateCard>
        </section>

        {/* ────────────────────── OUVERT À TOUS ────────────────────── */}
        <section className="mt-7">
          <OrnateCard>
            <div className="flex items-start gap-5 p-7 sm:p-8">
              <GoldDisc Icon={Network} />
              <div className="min-w-0 flex-1 pt-1">
                <h3
                  className="mb-3 text-xl font-bold uppercase tracking-[0.18em]"
                  style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
                >
                  <Gold>C'est ouvert à tous les Los motivés</Gold>
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-300">
                  Qui veulent avancer, faire évoluer leur situation et profiter d'une
                  vraie <span className="text-[#f5d76e]">ambiance de réussite</span>.
                </p>
              </div>
            </div>
          </OrnateCard>
        </section>

        {/* ────────────────────── LES 4 PILIERS ────────────────────── */}
        <section className="mt-12">
          <OrnateCard>
            <div className="px-6 pb-9 pt-10 sm:px-8">
              <h3
                className="text-center text-base font-bold uppercase tracking-[0.28em]"
                style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
              >
                <Gold>Le plus important, c'est :</Gold>
              </h3>
              <div className="mt-2 flex justify-center">
                <Flourish />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
                {PILLARS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div key={p.label} className="flex flex-col items-center text-center">
                      <div
                        aria-hidden
                        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                        style={{
                          background:
                            "radial-gradient(circle at 30% 25%, rgba(255,230,160,0.30), rgba(122,31,43,0.18) 60%, rgba(0,0,0,0.65))",
                          border: "1px solid rgba(212,175,55,0.55)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 32px -10px rgba(212,175,55,0.55), 0 0 0 2px rgba(0,0,0,0.55)",
                        }}
                      >
                        <Icon size={30} strokeWidth={1.5} className="text-[#f5d76e]" />
                      </div>
                      <span
                        className="whitespace-pre-line text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-slate-100"
                        style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
                      >
                        {p.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </OrnateCard>
        </section>

        {/* ────────────────────── PHRASE COLLECTIF ────────────────────── */}
        <section className="mt-12">
          <p
            className="mx-auto max-w-2xl text-center text-[14px] uppercase leading-relaxed tracking-[0.16em] text-slate-300 sm:text-[15px]"
            style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontWeight: 500 }}
          >
            Si tout le monde joue le jeu, la montée peut être très rapide.
          </p>
          <p
            className="mx-auto mt-3 max-w-2xl text-center text-[14px] uppercase leading-relaxed tracking-[0.16em] text-slate-200 sm:text-[15px]"
            style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontWeight: 600 }}
          >
            Le système repose sur le collectif : plus la base est solide,
            <br className="hidden sm:inline" /> plus les résultats deviennent gros pour tout le monde.
          </p>
        </section>

        {/* ────────────────────── OBJECTIF ────────────────────── */}
        <section className="mt-12">
          <OrnateCard>
            <div className="flex items-start gap-5 p-7 sm:p-8">
              <GoldDisc Icon={Target} />
              <div className="min-w-0 flex-1 pt-1">
                <h3
                  className="mb-3 text-xl font-bold uppercase tracking-[0.18em]"
                  style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
                >
                  <Gold>L'objectif, c'est pas juste une soirée.</Gold>
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-300">
                  C'est créer un vrai mouvement autour de{" "}
                  <strong className="text-[#f5d76e]">l'ambition</strong>, du{" "}
                  <strong className="text-[#f5d76e]">luxe</strong>, de{" "}
                  <strong className="text-[#f5d76e]">l'argent</strong> et de la{" "}
                  <strong className="text-[#f5d76e]">réussite collective</strong>.
                </p>
              </div>
            </div>
          </OrnateCard>
        </section>

        {/* ────────────────────── VALEURS / AMBIANCE ────────────────────── */}
        <section className="mt-12">
          <h3
            className="text-center text-base font-bold uppercase tracking-[0.28em]"
            style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
          >
            <Gold>Ambiance propre, organisée et efficace :</Gold>
          </h3>
          <div className="mt-2 flex justify-center">
            <Flourish />
          </div>
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-5 sm:gap-x-7">
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.label} className="flex flex-col items-center text-center">
                  <div
                    aria-hidden
                    className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "radial-gradient(circle at 30% 25%, rgba(255,230,160,0.28), rgba(122,31,43,0.14) 60%, rgba(0,0,0,0.55))",
                      border: "1px solid rgba(212,175,55,0.50)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 28px -12px rgba(212,175,55,0.50)",
                    }}
                  >
                    <Icon size={24} strokeWidth={1.6} className="text-[#f5d76e]" />
                  </div>
                  <span
                    className="whitespace-pre-line text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-slate-100"
                    style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
                  >
                    {v.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ────────────────────── FOOTER / CITATION ────────────────────── */}
        <section className="mt-16">
          <Flourish wide />
          <p
            className="mt-7 text-center text-base font-bold uppercase tracking-[0.36em] sm:text-lg"
            style={{ fontFamily: "var(--font-cinzel), Georgia, serif" }}
          >
            <Gold>Los Esperados</Gold>
          </p>
          <p
            className="mx-auto mt-5 max-w-xl text-center text-2xl italic leading-snug text-slate-200 sm:text-3xl"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 500 }}
          >
            « Plus on construit ensemble,
            <br />
            plus on monte haut. »
          </p>
          <Flourish wide />
        </section>

        <p className="mt-12 text-center text-[10px] uppercase tracking-[0.32em] text-[#d4af37]/40">
          Technique J.L.G — losesperados.fr/jlg
        </p>
      </div>
    </main>
  );
}
