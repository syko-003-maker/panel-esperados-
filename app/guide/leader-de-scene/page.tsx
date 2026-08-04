import type { Metadata } from "next";
import { existsSync } from "fs";
import path from "path";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  Brain,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  Handshake,
  ListOrdered,
  Map,
  Megaphone,
  MessageSquare,
  Radio,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Target,
  Trophy,
  UserCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Guide Leader de Scène — Los Esperados",
  description:
    "Guide RP de la spécialisation Leader de Scène : organisation et gestion des scènes importantes chez Los Esperados.",
  openGraph: {
    title: "🎬 Guide Leader de Scène — Los Esperados",
    description: "Braquages, prises d'otages, assauts — la spécialisation Leader de Scène.",
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
    id: "missions",
    title: "Vos missions",
    subtitle: "Ce qu'on attend de vous pendant l'action.",
    accent: "bordeaux",
    icon: Megaphone,
    rules: [
      {
        icon: Crown,
        subject: "Prendre le commandement",
        severity: "critique",
        rule: "Vous menez la scène du début à la fin. Un seul leader décide.",
      },
      {
        icon: Users,
        subject: "Répartir les rôles",
        severity: "critique",
        rule: "Chaque personne présente sait ce qu'elle a à faire avant de bouger.",
      },
      {
        icon: Radio,
        subject: "Maintenir la communication",
        severity: "important",
        rule: "L'information circule en permanence, dans les deux sens.",
      },
      {
        icon: ShieldAlert,
        subject: "Éviter le chaos",
        severity: "important",
        rule: "Pas d'actions inutiles : tout ce qui se fait sert la scène.",
      },
      {
        icon: ScrollText,
        subject: "Faire respecter le règlement RP",
        severity: "critique",
        rule: "La scène reste dans le cadre du règlement, sans exception.",
      },
    ],
  },
  {
    id: "responsabilites",
    title: "Vos responsabilités",
    subtitle: "Les engagements qui viennent avec la spécialité.",
    accent: "amber",
    icon: UserCheck,
    rules: [
      {
        icon: MessageSquare,
        subject: "Des ordres clairs",
        severity: "critique",
        rule: "Donnez des ordres clairs et précis. Une consigne floue est une consigne perdue.",
      },
      {
        icon: CheckCircle2,
        subject: "Vérifier AVANT de lancer",
        severity: "critique",
        rule: "Chaque joueur connaît son rôle avant le début de l'action : back, conducteur, etc.",
      },
      {
        icon: Handshake,
        subject: "Contact avec le négociateur",
        severity: "important",
        rule: "Gardez des contacts réguliers avec votre négociateur pendant toute la scène.",
      },
      {
        icon: Map,
        subject: "Adapter la stratégie",
        severity: "important",
        rule: "Chaque scène est différente : la stratégie s'ajuste au lieu et à la situation.",
      },
      {
        icon: Target,
        subject: "Rester sur le lead",
        severity: "critique",
        rule: "Vous n'avez aucun autre rôle important que le lead de la scène.",
      },
    ],
  },
];

const COMPETENCES: { icon: LucideIcon; text: string }[] = [
  { icon: Sparkles, text: "Avoir un bon niveau RP." },
  { icon: Megaphone, text: "Être bon en communication et donner des directives claires et précises." },
  { icon: Brain, text: "Être capable de garder son calme, même sous pression." },
  { icon: Zap, text: "Prendre des décisions rapides et cohérentes, notamment lors des retours de votre négociateur." },
  { icon: ScrollText, text: "Avoir une bonne connaissance du règlement du serveur, afin d'éviter les actions no RP." },
];

const INTERDICTIONS: { icon: LucideIcon; text: string }[] = [
  { icon: Crown, text: "Abuser de son autorité" },
  { icon: AlertTriangle, text: "Perdre son sang-froid" },
  { icon: Ban, text: "Lancer une scène sans préparation" },
];

const QUALITES = [
  { icon: Handshake, label: "Le respect" },
  { icon: ShieldCheck, label: "La maturité" },
  { icon: Scale, label: "L'impartialité" },
  { icon: Zap, label: "La réactivité" },
  { icon: ListOrdered, label: "L'organisation" },
  { icon: Brain, label: "L'esprit d'analyse" },
];

const ETAPES: { title: string; detail: string }[] = [
  {
    title: "Briefing des membres",
    detail: "Tout le monde sait ce qui va se passer avant que ça commence.",
  },
  {
    title: "Attribution des rôles",
    detail: "Négociateur, conduite, les bacs, le home pour le potentiel fight, etc.",
  },
  {
    title: "Début de la scène",
    detail: "Vous donnez le départ et vous tenez la direction.",
  },
  {
    title: "Gestion des imprévus",
    detail: "La stratégie s'adapte : c'est là que le rôle prend tout son sens.",
  },
  {
    title: "Débriefing avec les participants",
    detail: "On revient sur ce qui a marché et sur ce qui a manqué.",
  },
];

const SANCTIONS: { level: number; label: string; note?: string; tone: "amber" | "orange" | "rose" | "red" }[] = [
  { level: 1, label: "Avertissement oral", tone: "amber" },
  { level: 2, label: "Retrait temporaire de la spécialité", tone: "orange" },
  { level: 3, label: "Retrait définitif", tone: "rose" },
  { level: 4, label: "Sanction familiale", note: "selon la gravité", tone: "red" },
];

const TOTAL_RULES = CATEGORIES.reduce((n, c) => n + c.rules.length, 0);
const CRITICAL_COUNT = CATEGORIES.reduce(
  (n, c) => n + c.rules.filter((r) => r.severity === "critique").length,
  0,
);

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

const SANCTION_TONE = {
  amber: "border-amber-500/30 bg-amber-500/[0.06] text-amber-200",
  orange: "border-orange-500/30 bg-orange-500/[0.07] text-orange-200",
  rose: "border-rose-500/30 bg-rose-500/[0.08] text-rose-200",
  red: "border-rose-500/50 bg-rose-500/[0.13] text-rose-100",
} as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuideLeaderDeScenePage() {
  const publicDir = path.join(process.cwd(), "public", "guide", "leader-de-scene");
  const img = (name: string) =>
    existsSync(path.join(publicDir, name)) ? `/guide/leader-de-scene/${name}` : undefined;

  const cover1 = img("cover-1.jpg");
  const cover2 = img("cover-2.jpg");

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
              Spé Leader de Scène
            </h1>

            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-400 sm:text-lg">
              Celui qui tient la scène. Braquage de banque, prise d'otage, assaut de
              base : vous organisez, vous répartissez, vous décidez. Sans vous, c'est
              le chaos.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <StatBadge value={TOTAL_RULES} label="Règles" tone="default" />
              <StatBadge value={CRITICAL_COUNT} label="Critiques" tone="rose" />
              <StatBadge value={ETAPES.length} label="Étapes clés" tone="amber" />
              <StatBadge value={COMPETENCES.length} label="Prérequis" tone="emerald" />
            </div>
          </div>

          {/* Cover : 2 photos in-game */}
          {(cover1 || cover2) && (
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {cover1 && (
                <div className="group relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-30px_hsl(var(--sunset-surface2)/0.85)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover1}
                    alt="La famille Los Esperados rassemblée avant une action"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <p className="absolute bottom-4 left-5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200/90">
                    Briefing avant l'action
                  </p>
                </div>
              )}
              {cover2 && (
                <div className="group relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-30px_hsl(var(--sunset-surface2)/0.85)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover2}
                    alt="Braquage en cours face aux forces de l'ordre"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <p className="absolute bottom-4 left-5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200/90">
                    Scène en cours
                  </p>
                </div>
              )}
            </div>
          )}
        </header>

        {/* ── PRÉSENTATION ──────────────────────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[hsl(var(--sunset-surface)/0.72)] to-[hsl(var(--sunset-surface2)/0.84)] p-7 shadow-[0_24px_60px_-30px_hsl(var(--sunset-surface2)/0.85)] sm:p-9">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[hsl(var(--sunset-magenta))]/20 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--sunset-deep))]/45 bg-gradient-to-br from-[hsl(var(--sunset-deep))]/40 to-[#4a0f18]/20 text-amber-300 shadow-[0_8px_22px_-6px_hsl(var(--sunset-magenta)/0.6)]">
                <ScrollText className="h-6 w-6" />
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                  Objectif
                </p>
                <p className="text-base leading-relaxed text-slate-200/95">
                  Le Leader de Scène est responsable de{" "}
                  <strong>l'organisation et de la gestion des scènes RP importantes</strong>{" "}
                  — braquage de banque, prise d'otage, assaut de base, etc. Il veille au
                  bon déroulement des actions, au respect du règlement et à la cohérence
                  du RôlePlay.
                </p>
                <p className="text-sm leading-relaxed text-slate-400">
                  La spécialité est portée par <strong>plusieurs membres</strong> : il
                  n'y a pas de chef de spécialité. Deux règles en découlent, et elles
                  priment sur tout le reste.
                </p>
              </div>
            </div>
          </div>

          {/* Les deux règles qui découlent d'avoir plusieurs leaders. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.10] to-transparent p-5 sm:p-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
                <Crown className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-300/85">
                Pendant la scène
              </p>
              <h3 className="mt-1.5 text-lg font-bold tracking-tight text-slate-50">
                Un seul leader à la fois
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300/95">
                Si plusieurs leaders sont connectés, un <strong>seul</strong> prend le
                lead de la scène. Pas de double commandement.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/28 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-5 sm:p-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/38 bg-emerald-500/14 text-emerald-300">
                <RefreshCw className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/85">
                Entre deux scènes
              </p>
              <h3 className="mt-1.5 text-lg font-bold tracking-tight text-slate-50">
                Passez la main
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300/95">
                Rien n'empêche de changer de leader d'une scène à l'autre — il faut
                varier pour que <strong>chacun profite de sa spécialité</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ── MISSIONS ──────────────────────────────────────────── */}
        <section className="mb-16">
          <CategoryBlock category={CATEGORIES[0]} index={1} />

          {/* Rappel avant chaque mission */}
          <div className="mt-6 flex items-start gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.09] to-transparent p-5 sm:p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                Avant chaque mission
              </p>
              <p className="mt-1.5 text-base leading-relaxed text-slate-200/95">
                Votre rôle est de vérifier que <strong>tout soit bien en place</strong>,
                notamment de savoir si la <strong>base est bien posée</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ── COMPÉTENCES REQUISES ──────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Prérequis"
            title="Compétences requises"
            subtitle="Les compétences et prérequis pour obtenir cette spécialité."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {COMPETENCES.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.text}
                  className="flex items-start gap-3.5 rounded-2xl border border-emerald-500/22 bg-gradient-to-br from-emerald-500/[0.05] to-transparent p-4 transition-colors hover:border-emerald-500/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/12 text-emerald-300">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[13.5px] leading-6 text-slate-200/95">{c.text}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── RESPONSABILITÉS ───────────────────────────────────── */}
        <section className="mb-16">
          <CategoryBlock category={CATEGORIES[1]} index={2} />
        </section>

        {/* ── INTERDICTIONS ─────────────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Limites"
            title="Interdictions"
            subtitle="Un Leader de Scène ne doit jamais :"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {INTERDICTIONS.map((i) => {
              const Icon = i.icon;
              return (
                <div
                  key={i.text}
                  className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.10] to-transparent p-5"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold leading-6 text-slate-100">{i.text}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/12 text-amber-300">
              <Handshake className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-slate-300/95">
              Si vous avez obtenu cette spécialité, c'est qu'on a{" "}
              <strong className="text-slate-100">confiance en votre capacité</strong> à
              gérer un groupe et des scènes. Il vous est tout de même demandé de ne pas
              abuser de votre statut, ni de notre confiance.
            </p>
          </div>
        </section>

        {/* ── QUALITÉS ATTENDUES ────────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="État d'esprit"
            title="Qualités attendues"
            subtitle="Les qualités demandées pour un Leader de Scène."
          />

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {QUALITES.map((q) => {
              const Icon = q.icon;
              return (
                <div
                  key={q.label}
                  className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/35 hover:bg-amber-500/[0.06]"
                >
                  <Icon className="h-4.5 w-4.5 shrink-0 text-amber-300/90" />
                  <span className="text-sm font-semibold text-slate-100">{q.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── DÉROULÉ D'UNE SCÈNE ───────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Méthode"
            title="Déroulé d'une scène"
            subtitle="L'exemple d'organisation à suivre pour une bonne scène RP."
          />

          <ol className="relative space-y-3 pl-0">
            {ETAPES.map((e, i) => (
              <li
                key={e.title}
                className="group relative flex items-start gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-transparent p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/30"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/12 text-lg font-black tabular-nums text-amber-300">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight text-slate-50">
                    {e.title}
                  </h3>
                  <p className="mt-1 text-[13.5px] leading-6 text-slate-400">{e.detail}</p>
                </div>
                {i < ETAPES.length - 1 && (
                  <div className="pointer-events-none absolute -bottom-3 left-[26px] h-3 w-px bg-gradient-to-b from-amber-500/50 to-transparent" />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* ── SANCTIONS ─────────────────────────────────────────── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Cadre"
            title="Sanctions possibles"
            subtitle="En cas de non-respect des responsabilités ou d'abus de confiance, vous vous exposez à :"
          />

          <div className="grid gap-2.5">
            {SANCTIONS.map((s) => (
              <div
                key={s.level}
                className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${SANCTION_TONE[s.tone]}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/25 bg-black/25 text-sm font-black tabular-nums">
                  {s.level}
                </span>
                <span className="text-sm font-semibold text-slate-100">
                  {s.label}
                  {s.note && (
                    <span className="ml-2 font-normal text-slate-400">— {s.note}</span>
                  )}
                </span>
                {s.level === 4 && <Siren className="ml-auto h-4.5 w-4.5 shrink-0 opacity-70" />}
              </div>
            ))}
          </div>
        </section>

        {/* ── REMONTÉE ──────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-sky-500/25 bg-gradient-to-br from-sky-950/30 to-transparent p-6 sm:p-7">
            <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-sky-500/12 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/35 bg-sky-500/12 text-sky-300">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300/85">
                  Si ça se passe mal
                </p>
                <p className="mt-1.5 text-base leading-relaxed text-slate-200/95">
                  Si une personne ne respecte pas les missions que vous donnez pendant une
                  scène, <strong>faites-le remonter</strong>. Nous verrons avec elle
                  pourquoi elle n'a pas tenu son rôle.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CONCLUSION ────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--sunset-magenta))]/45 bg-gradient-to-br from-[#3a0c14]/55 via-[#4a0f18]/30 to-transparent p-7 shadow-[0_24px_60px_-25px_hsl(var(--sunset-magenta)/0.55)] sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.10),transparent_50%)]" />

            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--sunset-magenta))]/50 bg-[hsl(var(--sunset-magenta))]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_-6px_hsl(var(--sunset-magenta)/0.55)]">
                <Trophy className="h-8 w-8 text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300/95">
                  Conclusion
                </p>
                <h3 className="mt-1.5 text-xl font-bold leading-tight text-slate-50 sm:text-2xl">
                  Vous êtes l'élément principal du bon déroulement de la scène.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300/95">
                  Le Leader de Scène est un rôle essentiel au bon fonctionnement de la
                  famille. Son objectif est de garantir un roleplay{" "}
                  <strong>sérieux, organisé et agréable</strong> pour tous les membres.
                  En cas de problème sur les scènes, vous serez le principal mis en cause.
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
              · {category.rules.length} points
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
