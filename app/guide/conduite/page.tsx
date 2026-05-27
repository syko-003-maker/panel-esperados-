import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  HeartCrack,
  Ban,
  Radio,
  Timer,
  Car,
  Activity,
  Hand,
  TrendingUp,
  Sparkles,
  Clock,
  AlertTriangle,
  AlertOctagon,
  Gauge,
  MapPin,
  Building2,
  Beer,
  Fuel,
  Landmark,
  Shield,
  Dices,
  Route,
  Trophy,
  ScrollText,
  ShieldCheck,
  Star,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Guide Conduite — Los Esperados",
  description:
    "Guide RP de la spécialisation conduite : règles, conseils techniques et voitures recommandées chez Los Esperados.",
  openGraph: {
    title: "🏛️ Guide Conduite — Los Esperados",
    description:
      "Le moteur de la famille. Règles, technique et voitures conseillées.",
    images: ["/branding/los-esperados.png"],
  },
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Severity = "critique" | "important" | "info";

type Rule = {
  icon: LucideIcon;
  subject: string;
  rule: string;
  severity: Severity;
};

type RuleCategory = {
  id: string;
  title: string;
  subtitle: string;
  accent: "bordeaux" | "amber" | "slate";
  icon: LucideIcon;
  rules: Rule[];
};

const CATEGORIES: RuleCategory[] = [
  {
    id: "reglement",
    title: "Règlement",
    subtitle: "Les fondamentaux à respecter dans toute situation.",
    accent: "bordeaux",
    icon: AlertOctagon,
    rules: [
      {
        icon: HeartCrack,
        subject: "PainRP / FearRP",
        severity: "critique",
        rule: "Dans chaque situation, respectez votre PainRP et votre FearRP (douleur et peur).",
      },
      {
        icon: Ban,
        subject: "PowerGaming",
        severity: "critique",
        rule: "Aucune action que l'on ne peut pas reproduire dans la vraie vie. Le PowerGaming est strictement interdit.",
      },
      {
        icon: Radio,
        subject: "Sommations en poursuite",
        severity: "critique",
        rule: "Si vous êtes poursuivis, effectuez des sommations dans le chat avant d'ouvrir le feu. /pub 1ère sommation : cesser de suivre le véhicule.",
      },
      {
        icon: Timer,
        subject: "Délai entre sommations",
        severity: "important",
        rule: "10 secondes minimum entre chaque sommation. Pas plus rapide.",
      },
      {
        icon: Car,
        subject: "Pas Fast & Furious",
        severity: "important",
        rule: "Soignez votre conduite au maximum. Ce n'est pas une course d'arcade.",
      },
      {
        icon: Activity,
        subject: "Après un accident",
        severity: "critique",
        rule: "5s d'attente petit accident · 10s gros accident · 10s avant de sortir si véhicule explosé · +10s avant de sortir l'arme et tirer.",
      },
    ],
  },
  {
    id: "conduite",
    title: "Conduite à tenir & conseils",
    subtitle: "Technique, anticipation, créativité. Tu dois maîtriser ta voiture.",
    accent: "amber",
    icon: Gauge,
    rules: [
      {
        icon: Hand,
        subject: "Maîtrise du véhicule",
        severity: "critique",
        rule: "ZQSD : tournez à gauche avec Z+Q, contre-braquez avec D pour ne pas déraper. Certaines freinent à ESPACE, d'autres driftent — connaissez votre voiture parfaitement avant un braquage.",
      },
      {
        icon: TrendingUp,
        subject: "Anticipation",
        severity: "important",
        rule: "Anticipez vos mouvements pour être fluide et précis. Évitez les corrections brusques.",
      },
      {
        icon: Radio,
        subject: "Calls radio précis",
        severity: "important",
        rule: "Précisez vos calls radio à l'avance et soyez clair pour que le renfort arrive au bon endroit.",
      },
      {
        icon: Sparkles,
        subject: "Créativité RP",
        severity: "info",
        rule: "Ex : pour un braquage de banque, partez côté armurerie + un 2e véhicule simule une panne / accident pour ralentir la police.",
      },
      {
        icon: Clock,
        subject: "Chaque seconde compte",
        severity: "info",
        rule: "Même 5 secondes gagnées peuvent vous sauver durant une poursuite.",
      },
      {
        icon: AlertTriangle,
        subject: "Bugs de texture",
        severity: "important",
        rule: "Vigilance sur les bugs : panneau qui apparaît au dernier moment, blocage de map. Anticipez pour ne pas mettre votre équipage en difficulté.",
      },
    ],
  },
];

const TOTAL_RULES = CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0);
const CRITICAL_COUNT = CATEGORIES.reduce(
  (sum, c) => sum + c.rules.filter((r) => r.severity === "critique").length,
  0,
);

// Points d'intérêt sur la carte (légende braquage)
const MAP_POINTS: Array<{ icon: LucideIcon; label: string; tone: string }> = [
  { icon: Landmark, label: "Banque",              tone: "emerald" },
  { icon: Beer,     label: "Bar",                 tone: "sky" },
  { icon: Fuel,     label: "Shell Ville",         tone: "amber" },
  { icon: Fuel,     label: "Shell extérieur ville", tone: "rose" },
  { icon: Shield,   label: "Armurie",             tone: "indigo" },
  { icon: Dices,    label: "Casino",              tone: "bordeaux" },
];

// Voitures conseillées
type Car = {
  name: string;
  image: string; // filename in /public/guide/conduite/
  price?: string;
  level: "Débutant" | "Intermédiaire" | "Confirmé";
  rating: number; // 1–5
  pros: string[];
  cons: string[];
  description: string;
};

const CARS: Car[] = [
  {
    name: "Kia Stinger",
    image: "car-kia.jpg",
    price: "2 M",
    level: "Débutant",
    rating: 4,
    pros: ["Maniable", "Tient la route", "Bonne accélération"],
    cons: ["Ne drift pas"],
    description:
      "Maniable, ne drift pas, tient bien la route. Bonne accélération. Idéale pour débuter — coûte 2M mais reste rentable.",
  },
  {
    name: "Mercedes C63s",
    image: "car-mercedes.jpg",
    level: "Intermédiaire",
    rating: 4,
    pros: ["Maniable", "Tourne bien", "Bonne accélération"],
    cons: ["Prix élevé pour ce qu'elle est"],
    description:
      "Maniable, ne drift pas, tourne très bien. Bonne accélération. Un peu chère pour ce qu'elle est, mais c'est une superbe voiture.",
  },
  {
    name: "McLaren 720s",
    image: "car-mclaren.jpg",
    level: "Confirmé",
    rating: 5,
    pros: ["Maniable", "Tient la route", "Drift à la demande", "Disponible F6"],
    cons: ["Prix élevé"],
    description:
      "Assez maniable, tient bien la route et drift uniquement si on le veut. Disponible sur le F6 mais prix assez élevé. Recommandée.",
  },
  {
    name: "Nissan GTR",
    image: "car-gtr.jpg",
    level: "Confirmé",
    rating: 3,
    pros: ["Bonne accélération", "Bonne vitesse"],
    cons: ["Ne tient pas la route", "Drift beaucoup trop"],
    description:
      "Bonne accélération et bonne vitesse, mais ne tient pas la route et drift beaucoup trop. Pas faite pour tout le monde.",
  },
];

// ---------------------------------------------------------------------------
// Styling helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<
  Severity,
  { badge: string; ring: string; iconBg: string; label: string }
> = {
  critique: {
    label: "Critique",
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-200",
    ring: "border-rose-500/25 from-rose-500/[0.04] to-transparent hover:border-rose-500/40",
    iconBg: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  },
  important: {
    label: "Important",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    ring: "border-amber-500/25 from-amber-500/[0.04] to-transparent hover:border-amber-500/40",
    iconBg: "border-amber-500/35 bg-amber-500/12 text-amber-300",
  },
  info: {
    label: "Info",
    badge: "border-sky-500/40 bg-sky-500/15 text-sky-200",
    ring: "border-sky-500/25 from-sky-500/[0.04] to-transparent hover:border-sky-500/40",
    iconBg: "border-sky-500/35 bg-sky-500/12 text-sky-300",
  },
};

const CATEGORY_ACCENT: Record<
  RuleCategory["accent"],
  { tag: string; glow: string; bar: string }
> = {
  bordeaux: {
    tag: "border-[#9b2335]/45 bg-[#9b2335]/12 text-rose-200",
    glow: "bg-[#9b2335]/25",
    bar: "from-[#9b2335]/0 via-[#9b2335]/60 to-[#9b2335]/0",
  },
  amber: {
    tag: "border-amber-500/45 bg-amber-500/12 text-amber-200",
    glow: "bg-amber-500/25",
    bar: "from-amber-500/0 via-amber-500/60 to-amber-500/0",
  },
  slate: {
    tag: "border-slate-500/40 bg-slate-500/12 text-slate-200",
    glow: "bg-slate-500/20",
    bar: "from-slate-500/0 via-slate-400/50 to-slate-500/0",
  },
};

const POINT_TONE: Record<string, { icon: string; label: string }> = {
  emerald:  { icon: "border-emerald-500/40 bg-emerald-500/12 text-emerald-300", label: "text-emerald-200" },
  sky:      { icon: "border-sky-500/40 bg-sky-500/12 text-sky-300",             label: "text-sky-200" },
  amber:    { icon: "border-amber-500/40 bg-amber-500/12 text-amber-300",       label: "text-amber-200" },
  rose:     { icon: "border-rose-500/40 bg-rose-500/12 text-rose-300",          label: "text-rose-200" },
  indigo:   { icon: "border-indigo-500/40 bg-indigo-500/12 text-indigo-300",    label: "text-indigo-200" },
  bordeaux: { icon: "border-[#9b2335]/45 bg-[#9b2335]/15 text-rose-300",        label: "text-rose-200" },
};

const LEVEL_BADGE: Record<Car["level"], string> = {
  "Débutant":      "border-emerald-500/40 bg-emerald-500/12 text-emerald-200",
  "Intermédiaire": "border-amber-500/40 bg-amber-500/12 text-amber-200",
  "Confirmé":      "border-rose-500/40 bg-rose-500/12 text-rose-200",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuideConduitePage() {
  const publicDir = path.join(process.cwd(), "public", "guide", "conduite");
  const img = (name: string) =>
    existsSync(path.join(publicDir, name)) ? `/guide/conduite/${name}` : undefined;

  const cover1   = img("cover-1.jpg");
  const cover2   = img("cover-2.jpg");
  const squad    = img("squad.png");
  const mapBrk   = img("carte-braquage.png");
  const mapPour  = img("carte-poursuite.png");
  const legende  = img("legende.png");

  return (
    <div className="relative min-h-screen text-slate-100">
      {/* Halos d'ambiance */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[#9b2335]/15 blur-3xl" />
        <div className="absolute top-[40%] right-[-15%] h-[500px] w-[500px] rounded-full bg-amber-500/8 blur-3xl" />
        <div className="absolute bottom-0 left-[-10%] h-[500px] w-[500px] rounded-full bg-[#9b2335]/8 blur-3xl" />
      </div>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <header className="relative mb-16">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200">
                Guide officiel Los Esperados
              </span>
            </div>

            <h1 className="max-w-3xl bg-gradient-to-b from-white via-white to-slate-400 bg-clip-text text-5xl font-black uppercase tracking-tight text-transparent sm:text-6xl lg:text-7xl">
              Spé Conduite
            </h1>

            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-400 sm:text-lg">
              Le moteur de la famille. Conduire les membres d'un point A à un B,
              gérer les poursuites, sauver l'équipage. La famille compte sur toi.
            </p>

            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
              Chef de la spécialité · Mohamed Condé
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <StatBadge value={TOTAL_RULES} label="Règles" tone="default" />
              <StatBadge value={CRITICAL_COUNT} label="Critiques" tone="rose" />
              <StatBadge value={MAP_POINTS.length} label="Spots clés" tone="amber" />
              <StatBadge value={CARS.length} label="Voitures conseillées" tone="emerald" />
            </div>
          </div>

          {/* Cover : 2 photos in-game */}
          {(cover1 || cover2) && (
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {cover1 && (
                <div className="group relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover1}
                    alt="Voitures Los Esperados sur la route"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
              )}
              {cover2 && (
                <div className="group relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover2}
                    alt="Convoi Los Esperados"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                </div>
              )}
            </div>
          )}
        </header>

        {/* ── PRÉSENTATION ──────────────────────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[rgba(14,5,7,0.72)] to-[rgba(10,3,5,0.84)] p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)] sm:p-9">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#9b2335]/20 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#7a1f2b]/45 bg-gradient-to-br from-[#7a1f2b]/40 to-[#4a0f18]/20 text-amber-300 shadow-[0_8px_22px_-6px_rgba(155,35,53,0.6)]">
                <ScrollText className="h-6 w-6" />
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                  Présentation
                </p>
                <p className="text-base leading-relaxed text-slate-200/95">
                  Si tu as choisi la spécialité <strong>conduite</strong>, ce n'est
                  certainement pas un hasard. Chez nous, les conducteurs occupent
                  une place essentielle au même titre que toutes les autres
                  spécialités.
                </p>
                <p className="text-base leading-relaxed text-slate-200/95">
                  Ton rôle : <strong>conduire les membres de la famille d'un point
                  A à un B</strong>, gérer les situations délicates lors de
                  poursuites et tout autre situation en véhicule.
                </p>
                <p className="text-sm leading-relaxed text-slate-400">
                  Que tu sois débutant ou expérimenté, ce guide va te permettre de
                  comprendre les fondamentaux de la conduite et d'en maîtriser les
                  aspects clés pour être performant.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── RÈGLES en grille thématique ──────────────────────── */}
        <section className="mb-20 space-y-14">
          {CATEGORIES.map((cat, idx) => (
            <CategoryBlock key={cat.id} category={cat} index={idx + 1} />
          ))}
        </section>

        {/* ── Squad divider ─────────────────────────────────────── */}
        {squad && (
          <section className="mb-16">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={squad}
                alt="Équipage Los Esperados"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between sm:bottom-6 sm:left-8 sm:right-8">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300/90 drop-shadow-lg">
                  L'équipage est prêt
                </p>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300/90 drop-shadow-lg">
                  Place à la cartographie
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── 4. CARTE ─────────────────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Cartographie"
            title="La carte"
            subtitle="Connais ton terrain : les spots à braquer et les routes pour t'évader."
          />

          {/* 4.1 Braquage : carte + légende */}
          <div className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#9b2335]/40 bg-[#9b2335]/12 text-rose-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  4.1
                </p>
                <h3 className="text-xl font-bold tracking-tight text-slate-50">
                  Spots de braquage
                </h3>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr] lg:items-start">
              {mapBrk && (
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/60 p-3 shadow-[0_18px_50px_-25px_rgba(0,0,0,0.85)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mapBrk}
                    alt="Carte de la ville — spots de braquage"
                    className="h-full w-full rounded-2xl object-contain"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {MAP_POINTS.map((p) => {
                  const tone = POINT_TONE[p.tone];
                  return (
                    <div
                      key={p.label}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-sm transition-colors hover:border-white/15"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}>
                        <p.icon className="h-5 w-5" />
                      </div>
                      <span className={`text-sm font-bold ${tone.label}`}>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4.2 Poursuite */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/12 text-amber-300">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  4.2
                </p>
                <h3 className="text-xl font-bold tracking-tight text-slate-50">
                  Tracés de poursuite
                </h3>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.04] to-transparent p-5 sm:p-6">
              {mapPour && (
                <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mapPour}
                    alt="Tracés de poursuite — comment semer la police"
                    className="h-full w-full rounded-xl object-contain"
                    loading="lazy"
                  />
                </div>
              )}
              <p className="text-sm leading-relaxed text-slate-300/95">
                Un plan qui donne une idée de comment <strong className="text-amber-200">semer la police</strong>.
                À partir du <strong>3ème tracé</strong>, vous pouvez déjà vous cacher : en théorie
                vous les aurez déjà semés. Si ce n'est pas le cas, continuez le
                tracé et recommencez-le si nécessaire.
              </p>
            </div>
          </div>
        </section>

        {/* ── 5. VOITURES CONSEILLÉES ──────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Sélection du chef"
            title="Voitures conseillées"
            subtitle="Les modèles validés par Mohamed Condé. Choisis selon ton niveau et ton style."
          />

          <div className="grid gap-5 md:grid-cols-2">
            {CARS.map((car) => (
              <CarCard key={car.name} car={car} />
            ))}
          </div>
        </section>

        {/* ── RAPPEL FINAL ─────────────────────────────────────── */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-3xl border-2 border-[#9b2335]/45 bg-gradient-to-br from-[#3a0c14]/55 via-[#4a0f18]/30 to-transparent p-7 shadow-[0_24px_60px_-25px_rgba(155,35,53,0.55)] sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.10),transparent_50%)]" />

            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#9b2335]/50 bg-[#9b2335]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_-6px_rgba(155,35,53,0.55)]">
                <Trophy className="h-8 w-8 text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300/95">
                  Le mot du chef
                </p>
                <h3 className="mt-1.5 text-xl font-bold leading-tight text-slate-50 sm:text-2xl">
                  Maîtrise ta voiture, sauve ton équipage.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300/95">
                  Un bon conducteur ne se mesure pas à sa vitesse, mais à sa
                  capacité d'anticiper, garder son sang-froid et ramener tout le
                  monde à la planque. La famille compte sur toi.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <footer className="flex flex-col items-center gap-4 border-t border-white/8 pt-8 text-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            <span>
              Document officiel Los Esperados — toute modification interne uniquement.
            </span>
          </div>
          <p className="bg-gradient-to-r from-amber-200 via-white to-rose-200 bg-clip-text text-sm font-bold italic text-transparent">
            Para la familia, para siempre.
          </p>
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (mêmes que /guide/build et /guide/negociation)
// ---------------------------------------------------------------------------

function StatBadge({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "default" | "rose" | "amber" | "emerald";
}) {
  const palette = {
    default: { num: "text-slate-100", lbl: "text-slate-400", border: "border-white/10 bg-white/[0.04]" },
    rose:    { num: "text-rose-200",   lbl: "text-rose-300/80", border: "border-rose-500/30 bg-rose-500/8" },
    amber:   { num: "text-amber-200",  lbl: "text-amber-300/80", border: "border-amber-500/30 bg-amber-500/8" },
    emerald: { num: "text-emerald-200",lbl: "text-emerald-300/80", border: "border-emerald-500/30 bg-emerald-500/8" },
  }[tone];

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2 ${palette.border} backdrop-blur-sm`}>
      <span className={`text-2xl font-black tabular-nums ${palette.num}`}>{value}</span>
      <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${palette.lbl}`}>{label}</span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">{subtitle}</p>}
    </div>
  );
}

function CategoryBlock({
  category,
  index,
}: {
  category: RuleCategory;
  index: number;
}) {
  const Icon = category.icon;
  const accent = CATEGORY_ACCENT[category.accent];

  return (
    <div className="relative">
      <div className={`pointer-events-none absolute -left-2 top-2 h-16 w-px bg-gradient-to-b ${accent.bar}`} />

      <div className="mb-6 flex items-start gap-4">
        <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${accent.tag} backdrop-blur-sm`}>
          <Icon className="h-6 w-6" />
          <div className={`pointer-events-none absolute inset-0 -z-10 rounded-2xl ${accent.glow} blur-2xl`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {String(index).padStart(2, "0")}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-600">
              · {category.rules.length} règles
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            {category.title}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{category.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {category.rules.map((r) => (
          <RuleCard key={r.subject} rule={r} />
        ))}
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  const sev = SEVERITY_STYLE[rule.severity];
  const Icon = rule.icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${sev.ring} from-white/[0.02] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-22px_rgba(0,0,0,0.7)]`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${sev.iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${sev.badge}`}>
          {sev.label}
        </span>
      </div>
      <h3 className="mb-1.5 text-sm font-bold tracking-tight text-slate-50">{rule.subject}</h3>
      <p className="text-[13px] leading-6 text-slate-300/90">{rule.rule}</p>
    </div>
  );
}

function CarCard({ car }: { car: Car }) {
  const levelBadge = LEVEL_BADGE[car.level];
  const publicDir = path.join(process.cwd(), "public", "guide", "conduite");
  const imgPath = existsSync(path.join(publicDir, car.image))
    ? `/guide/conduite/${car.image}`
    : undefined;

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[rgba(14,5,7,0.7)] to-[rgba(10,3,5,0.84)] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)] transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_70px_-25px_rgba(155,35,53,0.45)]">
      {/* Photo de la voiture en garage */}
      {imgPath && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-white/10 bg-black/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgPath}
            alt={car.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-md ${levelBadge}`}>
            {car.level}
          </span>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <h3 className="text-xl font-black tracking-tight text-white drop-shadow-lg">
              {car.name}
            </h3>
            {car.price && (
              <span className="rounded-full border border-amber-500/45 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-200 backdrop-blur-md">
                {car.price}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header alternatif (sans image) */}
      {!imgPath && (
        <div className="border-b border-white/8 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#9b2335]/40 bg-gradient-to-br from-[#7a1f2b]/30 to-[#4a0f18]/10 text-amber-300">
                <Car className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight text-slate-50">{car.name}</h3>
                {car.price && (
                  <p className="mt-0.5 text-xs font-semibold text-amber-300/90">Prix · {car.price}</p>
                )}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${levelBadge}`}>
              {car.level}
            </span>
          </div>
        </div>
      )}

      <div className="p-6">

      {/* Rating */}
      <div className="mb-4 flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < car.rating
                ? "fill-amber-300 text-amber-300"
                : "text-slate-700"
            }`}
          />
        ))}
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Avis du chef
        </span>
      </div>

      {/* Description */}
      <p className="mb-5 text-[13px] leading-6 text-slate-300/90">
        {car.description}
      </p>

      {/* Pros & Cons */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
            ✓ Points forts
          </p>
          <ul className="space-y-1">
            {car.pros.map((p) => (
              <li key={p} className="flex items-start gap-1.5 text-[12px] text-slate-300">
                <span className="mt-0.5 text-emerald-400">·</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
            ✗ Points faibles
          </p>
          <ul className="space-y-1">
            {car.cons.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-[12px] text-slate-300">
                <span className="mt-0.5 text-rose-400">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      </div>{/* /p-6 */}
    </div>
  );
}
