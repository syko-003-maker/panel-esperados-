import type { Metadata } from "next";
import {
  Users,
  Shield,
  HandshakeIcon,
  Megaphone,
  Stethoscope,
  AlertTriangle,
  Banknote,
  Crown,
  Car,
  RefreshCw,
  Bot,
  ShieldCheck,
  UsersRound,
  Volume2,
  Clock,
  Drama,
  AlertOctagon,
  Sparkles,
  Info,
  Hexagon,
  Trophy,
  ScrollText,
  ShieldAlert,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Handshake } from "lucide-react";

export const metadata: Metadata = {
  title: "Guide Négociation — Los Esperados",
  description:
    "Guide RP de la spécialisation négociation : braquages et prises d'otages chez Los Esperados.",
  openGraph: {
    title: "🏛️ Guide Négociation — Los Esperados",
    description: "Braquages & prises d'otages — la spécialisation négociation.",
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
    id: "pre-negociation",
    title: "Pré-négociation",
    subtitle: "Comment poser les bases avant que la négociation commence.",
    accent: "bordeaux",
    icon: Megaphone,
    rules: [
      {
        icon: Users,
        subject: "Négociateur unique",
        severity: "critique",
        rule: "Vous devez être le SEUL négociateur durant toute la négociation.",
      },
      {
        icon: Shield,
        subject: "Présentation",
        severity: "important",
        rule: "Présentez-vous armé mais arme baissée devant les Gendarmes. Écoutez attentivement.",
      },
      {
        icon: Stethoscope,
        subject: "Examen des otages",
        severity: "important",
        rule: "Quand les Gendarmes le demandent, présentez les otages pour un examen médical.",
      },
      {
        icon: AlertOctagon,
        subject: "Violence",
        severity: "critique",
        rule: "Aucune violence physique sur les otages sans raison RP valable.",
      },
      {
        icon: Clock,
        subject: "Anticipation",
        severity: "info",
        rule: "Pendant l'examen, commencez à réfléchir aux conditions de libération.",
      },
    ],
  },
  {
    id: "negociation",
    title: "Négociation",
    subtitle: "Les règles à respecter pendant les échanges.",
    accent: "amber",
    icon: Handshake,
    rules: [
      {
        icon: HandshakeIcon,
        subject: "Conditions",
        severity: "critique",
        rule: "Vous pouvez négocier 1 condition par otage présent. Pas plus.",
      },
      {
        icon: RefreshCw,
        subject: "Fuite",
        severity: "important",
        rule: "Choisissez de quel côté prendre la fuite une fois les négociations terminées.",
      },
      {
        icon: Drama,
        subject: "Cohérence",
        severity: "important",
        rule: "Restez cohérent dans vos demandes et évitez les abus HRP.",
      },
    ],
  },
];

const TOTAL_RULES = CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0);
const CRITICAL_COUNT = CATEGORIES.reduce(
  (sum, c) => sum + c.rules.filter((r) => r.severity === "critique").length,
  0,
);

// Conditions négociables (tableau du doc, transformé en grille de cards)
const CONDITIONS: Array<{
  icon: LucideIcon;
  label: string;
  limit: string;
  tone: "amber" | "bordeaux" | "sky" | "emerald" | "slate";
}> = [
  {
    icon: Banknote,
    label: "Argent",
    limit: "200 000 € maximum pour les otages civils et gendarmes.",
    tone: "emerald",
  },
  {
    icon: Crown,
    label: "Maire en otage",
    limit: "500 000 € maximum.",
    tone: "amber",
  },
  {
    icon: Car,
    label: "Véhicule",
    limit:
      "Possible si vous n'en avez pas, ou si votre véhicule a été volé / détruit.",
    tone: "sky",
  },
  {
    icon: Users,
    label: "Monnaie d'échange",
    limit: "Un otage doit être gardé pour sécuriser la fuite.",
    tone: "bordeaux",
  },
  {
    icon: Bot,
    label: "Herses / Drones",
    limit:
      "Demander l'absence est possible. À ne respecter que si l'otage est encore sous contrôle.",
    tone: "slate",
  },
  {
    icon: ShieldCheck,
    label: "Patrouilles",
    limit: "Nombre maximum de patrouilles autorisées durant la poursuite.",
    tone: "sky",
  },
  {
    icon: UsersRound,
    label: "Renforts",
    limit: "Possibilité de limiter leur nombre (ex : si 10 GM sont présents).",
    tone: "amber",
  },
];

const RP_TIPS = [
  "Parlez calmement, évitez de crier inutilement.",
  "Laissez le temps aux Gendarmes de répondre.",
  "Restez cohérent avec la situation et votre personnage.",
  "Évitez les demandes impossibles ou irréalistes.",
  "Une bonne négociation RP vaut plus qu'une victoire rapide.",
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

const CONDITION_TONE: Record<
  (typeof CONDITIONS)[number]["tone"],
  { ring: string; icon: string; tag: string }
> = {
  amber: {
    ring: "border-amber-500/25 from-amber-500/[0.04]",
    icon: "border-amber-500/40 bg-amber-500/12 text-amber-300",
    tag: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  },
  bordeaux: {
    ring: "border-[#9b2335]/30 from-[#9b2335]/[0.05]",
    icon: "border-[#9b2335]/45 bg-[#9b2335]/15 text-rose-300",
    tag: "border-[#9b2335]/40 bg-[#9b2335]/12 text-rose-200",
  },
  sky: {
    ring: "border-sky-500/25 from-sky-500/[0.04]",
    icon: "border-sky-500/40 bg-sky-500/12 text-sky-300",
    tag: "border-sky-500/35 bg-sky-500/10 text-sky-200",
  },
  emerald: {
    ring: "border-emerald-500/25 from-emerald-500/[0.04]",
    icon: "border-emerald-500/40 bg-emerald-500/12 text-emerald-300",
    tag: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  },
  slate: {
    ring: "border-slate-500/30 from-slate-500/[0.04]",
    icon: "border-slate-500/40 bg-slate-500/12 text-slate-200",
    tag: "border-slate-500/35 bg-slate-500/10 text-slate-200",
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuideNegociationPage() {
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
              Spé Négociation
            </h1>

            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-400 sm:text-lg">
              Braquages & prises d'otages. Le négociateur est responsable du bon
              déroulement des échanges avec les forces de l'ordre.
            </p>

            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
              Guide RP par Fernando Douanier
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <StatBadge value={TOTAL_RULES} label="Règles" tone="default" />
              <StatBadge value={CRITICAL_COUNT} label="Critiques" tone="rose" />
              <StatBadge value={CONDITIONS.length} label="Conditions" tone="amber" />
              <StatBadge value={RP_TIPS.length} label="Conseils RP" tone="emerald" />
            </div>
          </div>
        </header>

        {/* ── INTRO ─────────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[rgba(14,5,7,0.72)] to-[rgba(10,3,5,0.84)] p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)] sm:p-9">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#9b2335]/20 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#7a1f2b]/45 bg-gradient-to-br from-[#7a1f2b]/40 to-[#4a0f18]/20 text-amber-300 shadow-[0_8px_22px_-6px_rgba(155,35,53,0.6)]">
                <ScrollText className="h-6 w-6" />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                  Objectif de la spécialisation
                </p>
                <p className="text-base leading-relaxed text-slate-200/95">
                  Apprendre à gérer une négociation de manière sérieuse, RP et
                  organisée lors d'un braquage ou d'une prise d'otage. Le négociateur
                  est responsable du bon déroulement des échanges et doit garder
                  son calme durant toute la scène.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CATÉGORIE 1 : PRÉ-NÉGOCIATION ───────────────────── */}
        <section className="mb-12">
          <CategoryBlock category={CATEGORIES[0]} index={1} />
        </section>

        {/* ── ATTENTION : responsabilité otages ────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-orange-950/30 to-transparent p-6 shadow-[0_24px_60px_-25px_rgba(245,158,11,0.4)] sm:p-7">
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-amber-500/25 blur-3xl" />
            <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/50 bg-amber-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_-6px_rgba(245,158,11,0.5)]">
                <AlertTriangle className="h-7 w-7 text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300/95">
                  Attention — responsabilité
                </p>
                <p className="mt-1.5 text-base leading-relaxed text-slate-100/95 sm:text-lg">
                  En tant que braqueur ou preneur d'otage, vous êtes
                  <strong className="text-amber-200"> responsable des otages</strong>.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/95">
                  Si un otage meurt de faim, se blesse ou crée des problèmes, c'est
                  à vous de gérer la situation de manière RP.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CATÉGORIE 2 : NÉGOCIATION ────────────────────────── */}
        <section className="mb-12">
          <CategoryBlock category={CATEGORIES[1]} index={2} />
        </section>

        {/* ── CONDITIONS NÉGOCIABLES (ex-tableau, en grille) ───── */}
        <section className="mb-16">
          <SectionHeader
            eyebrow="Tarification RP"
            title="Conditions négociables"
            subtitle="1 condition par otage présent. Limites et règles à respecter pour rester cohérent."
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONDITIONS.map((c) => (
              <ConditionCard key={c.label} condition={c} />
            ))}
          </div>
        </section>

        {/* ── CONSEILS RP en bandeau ────────────────────────────── */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-3xl border border-[#9b2335]/30 bg-gradient-to-br from-[#7a1f2b]/20 via-[#4a0f18]/10 to-transparent p-7 shadow-[0_24px_60px_-30px_rgba(155,35,53,0.55)] sm:p-9">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#9b2335]/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#9b2335]/45 bg-gradient-to-br from-[#7a1f2b]/45 to-[#4a0f18]/20 text-amber-300 shadow-[0_8px_22px_-6px_rgba(155,35,53,0.6)]">
                  <Volume2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                    Mémo
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-50">
                    Conseils RP
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {RP_TIPS.map((tip, i) => (
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

        {/* ── BONUS ─────────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-transparent p-6 sm:p-7">
            <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/85">
                  Bonus
                </p>
                <p className="mt-1.5 text-base leading-relaxed text-slate-200/95">
                  Si vous avez de l'imagination, vous pouvez créer des conditions
                  supplémentaires tant qu'elles restent <strong>RP</strong> et
                  respectent le <strong>règlement du serveur</strong>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CONCLUSION ────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-3xl border-2 border-[#9b2335]/45 bg-gradient-to-br from-[#3a0c14]/55 via-[#4a0f18]/30 to-transparent p-7 shadow-[0_24px_60px_-25px_rgba(155,35,53,0.55)] sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.10),transparent_50%)]" />

            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#9b2335]/50 bg-[#9b2335]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_22px_-6px_rgba(155,35,53,0.55)]">
                <Trophy className="h-8 w-8 text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300/95">
                  Conclusion
                </p>
                <h3 className="mt-1.5 text-xl font-bold leading-tight text-slate-50 sm:text-2xl">
                  Une scène bien jouée vaut toujours plus qu'une scène expédiée.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300/95">
                  La négociation est un élément clé du RP. Respectez les règles,
                  les autres joueurs, et privilégiez toujours le fair-play.
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

function ConditionCard({
  condition,
}: {
  condition: (typeof CONDITIONS)[number];
}) {
  const tone = CONDITION_TONE[condition.tone];
  const Icon = condition.icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${tone.ring} to-transparent p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-22px_rgba(0,0,0,0.7)]`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-base font-bold tracking-tight text-slate-50">{condition.label}</h3>
      </div>
      <p className="text-[13px] leading-6 text-slate-300/90">{condition.limit}</p>
    </div>
  );
}
