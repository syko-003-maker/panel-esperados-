import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  Eye,
  ArrowRightLeft,
  Home,
  AlertTriangle,
  KeyRound,
  Lock,
  DoorOpen,
  Unlock,
  Crosshair,
  Building2,
  ArrowLeftRight,
  Wrench,
  Hammer,
  Camera,
  Layers,
  ChevronsUpDown,
  Target,
  KeySquare,
  Box,
  Sun,
  Car,
  Landmark,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Info,
  ScrollText,
  Sparkles,
  Hexagon,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Guide Build — Los Esperados",
  description:
    "Guide officiel des règles et conseils de construction pour la famille Los Esperados.",
  openGraph: {
    title: "🏛️ Guide Build — Los Esperados",
    description: "Règles importantes & conseils de construction.",
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

/** Regroupements thématiques pour faciliter la lecture & le visuel. */
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
    id: "securite",
    title: "Sécurité & accès",
    subtitle: "Tout ce qui touche aux portes, keypads et infiltration.",
    accent: "bordeaux",
    icon: Lock,
    rules: [
      { icon: KeyRound,       subject: "Keypads",         severity: "critique",  rule: "Un seul keypad visible par construction. Pas de faux keypads." },
      { icon: Lock,           subject: "Accès",           severity: "critique",  rule: "Interdiction de condamner des accès ou de coller des props aux portes." },
      { icon: DoorOpen,       subject: "Fading-doors",    severity: "critique",  rule: "Contrôlées uniquement via keypad ou bouton." },
      { icon: Unlock,         subject: "Lockpick",        severity: "important", rule: "Interdit de refermer une porte lockpick pendant l'action." },
      { icon: KeySquare,      subject: "Keypad-crack",    severity: "important", rule: "Les joueurs doivent être debout et face à la construction." },
      { icon: ChevronsUpDown, subject: "Courte-échelle",  severity: "important", rule: "Interdit d'utiliser un keypad ou un bouton comme appui." },
    ],
  },
  {
    id: "visibilite",
    title: "Visibilité & matériaux",
    subtitle: "Ce que les autres joueurs doivent pouvoir voir.",
    accent: "amber",
    icon: Eye,
    rules: [
      { icon: Eye,            subject: "Visibilité",       severity: "critique",  rule: "Pas de props volants, trop sombres / clairs ou bloquant la visibilité." },
      { icon: ArrowRightLeft, subject: "One-way props",    severity: "critique",  rule: "Les props visibles d'un seul côté sont interdits." },
      { icon: Layers,         subject: "Matériaux",        severity: "important", rule: "Pas de matériaux empêchant une bonne visibilité." },
      { icon: Sun,            subject: "Opacité",          severity: "info",      rule: "Modification d'opacité autorisée uniquement pour les commerces." },
      { icon: Crosshair,      subject: "Meurtrières",      severity: "critique",  rule: "Micro lignes, passages accroupis ou pour une seule personne sont interdits." },
    ],
  },
  {
    id: "construction",
    title: "Règles de construction",
    subtitle: "Comment et quand poser tes props.",
    accent: "bordeaux",
    icon: Hammer,
    rules: [
      { icon: Home,           subject: "Construction extérieure", severity: "info",      rule: "Autorisée si RP et sans gêner les autres joueurs." },
      { icon: AlertTriangle,  subject: "Constructions abusives",  severity: "critique",  rule: "Les builds donnant un avantage excessif sont interdits." },
      { icon: Hammer,         subject: "Construction RP",         severity: "important", rule: "Interdit de poser des props pendant une scène RP." },
      { icon: Wrench,         subject: "Installation",            severity: "important", rule: "Le 3D2D Textscreen est obligatoire pendant l'installation." },
      { icon: Box,            subject: "Sas",                     severity: "info",      rule: "Maximum : 2 sas intérieurs et 1 sas extérieur." },
      { icon: ArrowLeftRight, subject: "Travers",                 severity: "important", rule: "Autorisé seulement sur certains matériaux autorisés." },
    ],
  },
  {
    id: "specifiques",
    title: "Éléments spécifiques",
    subtitle: "Caméras, véhicules, lieux particuliers.",
    accent: "slate",
    icon: Hexagon,
    rules: [
      { icon: Building2,      subject: "Miradors",        severity: "critique", rule: "Les miradors sont interdits." },
      { icon: Camera,         subject: "Caméras",         severity: "important", rule: "Interdit de cacher ou protéger les caméras avec des props." },
      { icon: Target,         subject: "Zone de tir",     severity: "important", rule: "Une seule zone de tir / vision par build intérieur." },
      { icon: Car,            subject: "Véhicules",       severity: "important", rule: "Interdit d'entourer un véhicule avec des props." },
      { icon: Landmark,       subject: "Mairie",          severity: "critique", rule: "Aligner un couloir avec l'escalier de la mairie est interdit." },
    ],
  },
];

const TOTAL_RULES = CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0);
const CRITICAL_COUNT = CATEGORIES.reduce(
  (sum, c) => sum + c.rules.filter((r) => r.severity === "critique").length,
  0,
);

const GENERAL_TIPS = [
  "Privilégier les props épais pour éviter les travers.",
  "Ne jamais aligner un couloir avec une ligne de tir.",
  "Toujours laisser une visibilité correcte aux joueurs.",
  "Éviter les constructions abusives ou impossibles à attaquer.",
  "Faire des sas propres et visibles.",
];

// ---------------------------------------------------------------------------
// Severity styling
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
    tag: "border-[hsl(var(--sunset-magenta))]/45 bg-[hsl(var(--sunset-magenta))]/12 text-rose-200",
    glow: "bg-[hsl(var(--sunset-magenta))]/25",
    bar: "from-[hsl(var(--sunset-magenta))]/0 via-[hsl(var(--sunset-magenta))]/60 to-[hsl(var(--sunset-magenta))]/0",
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuideBuildPage() {
  const publicGuide = path.join(process.cwd(), "public", "guide");
  const img = (name: string) =>
    existsSync(path.join(publicGuide, name)) ? `/guide/${name}` : undefined;

  return (
    <div className="relative min-h-screen text-slate-100">
      {/* Halos d'ambiance */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[hsl(var(--sunset-magenta))]/15 blur-3xl" />
        <div className="absolute top-[40%] right-[-15%] h-[500px] w-[500px] rounded-full bg-amber-500/8 blur-3xl" />
        <div className="absolute bottom-0 left-[-10%] h-[500px] w-[500px] rounded-full bg-[hsl(var(--sunset-magenta))]/8 blur-3xl" />
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
              Spé Build
            </h1>

            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-400 sm:text-lg">
              Tout ce qu'il faut savoir pour construire dans les règles. À lire
              avant de poser le premier prop.
            </p>

            {/* Stats badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <StatBadge value={TOTAL_RULES} label="Règles" tone="default" />
              <StatBadge value={CRITICAL_COUNT} label="Critiques" tone="rose" />
              <StatBadge value={CATEGORIES.length} label="Thématiques" tone="amber" />
              <StatBadge value={GENERAL_TIPS.length} label="Conseils clés" tone="emerald" />
            </div>
          </div>
        </header>

        {/* ── RÈGLES en grille thématique ──────────────────────── */}
        <section className="mb-20 space-y-14">
          {CATEGORIES.map((cat, idx) => (
            <CategoryBlock key={cat.id} category={cat} index={idx + 1} />
          ))}
        </section>

        {/* ── EXEMPLES ─────────────────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="En pratique"
            title="Exemples visuels"
            subtitle="Vois la différence entre ce qui passe et ce qui ne passe pas."
          />

          <div className="grid gap-5 md:grid-cols-2">
            <ExampleCard
              type="good"
              title="Prise de zone"
              description="Cloisons épaisses, accès contrôlés, visibilité maîtrisée. Le grillage laisse voir l'extérieur, les murs bloquent les angles morts."
              imageSrc={img("example-zone.jpg")}
            />
            <ExampleCard
              type="good"
              title="Intérieur — escalier"
              description="Cloisons propres autour d'un escalier intérieur. Rambardes RP, visibilité conservée pour les joueurs en bas."
              imageSrc={img("example-interieur.jpg")}
            />
            <ExampleCard
              type="good"
              title="Intérieur — sas"
              description="Sas court et lisible, joueur visible dès l'entrée. Pas de coude piégeux, pas de couloir borgne."
              imageSrc={img("example-interieur-2.jpg")}
            />
            <ExampleCard
              type="bad"
              title="Travers à éviter"
              description="Props fins en première ligne = travers facile. Toujours privilégier les props épais pour bloquer le tir adverse."
              imageSrc={img("example-travers.jpg")}
            />
          </div>
        </section>

        {/* ── CONSEILS GÉNÉRAUX en bandeau ─────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--sunset-magenta))]/30 bg-gradient-to-br from-[hsl(var(--sunset-deep))]/20 via-[#4a0f18]/10 to-transparent p-7 shadow-[0_24px_60px_-30px_hsl(var(--sunset-magenta)/0.55)] sm:p-9">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[hsl(var(--sunset-magenta))]/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--sunset-magenta))]/45 bg-gradient-to-br from-[hsl(var(--sunset-deep))]/45 to-[#4a0f18]/20 text-amber-300 shadow-[0_8px_22px_-6px_hsl(var(--sunset-magenta)/0.6)]">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                    Mémo
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-50">
                    Conseils généraux
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {GENERAL_TIPS.map((tip, i) => (
                  <div
                    key={tip}
                    className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-sm"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-emerald-500/12 text-[11px] font-bold text-emerald-300">
                      {i + 1}
                    </div>
                    <span className="text-sm leading-6 text-slate-200">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── RAPPEL FINAL ─────────────────────────────────────── */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-3xl border-2 border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-[#3a0c14]/40 to-transparent p-7 shadow-[0_24px_60px_-25px_rgba(225,29,72,0.5)] sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_55%)]" />

            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-rose-500/50 bg-rose-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_-6px_rgba(225,29,72,0.55)]">
                <ShieldAlert className="h-8 w-8 text-rose-200" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-rose-300/95">
                  Rappel important
                </p>
                <h3 className="mt-1.5 text-xl font-bold leading-tight text-slate-50 sm:text-2xl">
                  Le non-respect de ces règles entraîne des sanctions.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300/95">
                  Construis intelligemment, dans le respect du fair-play et du roleplay.
                  Le staff vérifie. En cas de doute, demande avant de poser.
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
// Sub-components
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
      {/* Barre d'accent verticale décorative */}
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
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${sev.ring} from-white/[0.02] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-22px_hsl(var(--sunset-surface2)/0.7)]`}
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

function ExampleCard({
  type,
  title,
  description,
  imageSrc,
}: {
  type: "good" | "bad";
  title: string;
  description: string;
  imageSrc?: string;
}) {
  const isGood = type === "good";
  const Icon = isGood ? CheckCircle2 : XCircle;
  const ringClass = isGood
    ? "border-emerald-500/30 from-emerald-500/[0.04] to-transparent"
    : "border-rose-500/30 from-rose-500/[0.04] to-transparent";
  const iconBg = isGood
    ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
    : "border-rose-500/45 bg-rose-500/15 text-rose-300";
  const badgeText = isGood ? "Conforme" : "À éviter";
  const badgeClass = isGood
    ? "border-emerald-500/45 bg-emerald-500/18 text-emerald-200"
    : "border-rose-500/45 bg-rose-500/18 text-rose-200";

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-br ${ringClass} shadow-[0_24px_60px_-30px_hsl(var(--sunset-surface2)/0.7)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-25px_hsl(var(--sunset-surface2)/0.85)]`}
    >
      {imageSrc && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-white/10 bg-black/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span
            className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-md ${badgeClass}`}
          >
            {badgeText}
          </span>
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconBg} backdrop-blur-md`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <h3 className="text-base font-bold tracking-tight text-slate-50 drop-shadow-lg">{title}</h3>
          </div>
        </div>
      )}
      {!imageSrc && (
        <div className="border-b border-white/8 p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconBg}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight text-slate-50">{title}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${badgeClass}`}>
                {badgeText}
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="p-5">
        <p className="text-sm leading-6 text-slate-300/95">{description}</p>
      </div>
    </div>
  );
}
