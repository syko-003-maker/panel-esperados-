"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
import PerfModeToggle from "@/components/perf-mode-toggle";
import {
  LayoutDashboard,
  Users,
  FileText,
  AlertCircle,
  Ban,
  Logs,
  Settings,
  LogOut,
  Banknote,
  Briefcase,
  Clock,
  BarChart3,
  TriangleAlert,
  Hammer,
  Handshake,
  Car,
  Crown,
  Calculator,
  BookOpen,
} from "lucide-react";

const SIDEBAR_ITEMS = [
  {
    section: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/staff/dashboard" },
      { icon: Users, label: "Membres", href: "/staff/members" },
      { icon: Crown, label: "Famille WL", href: "/staff/family" },
    ],
  },
  {
    section: "Gestion",
    items: [
      { icon: Briefcase, label: "Recrutements", href: "/staff/recruitments" },
      { icon: FileText, label: "Plaintes", href: "/staff/complaints" },
      { icon: AlertCircle, label: "Sanctions", href: "/staff/sanctions" },
      { icon: TriangleAlert, label: "Warns in-game", href: "/staff/warns" },
      { icon: Clock, label: "Absences", href: "/staff/absences" },
      { icon: Logs, label: "Réunions", href: "/staff/meetings" },
    ],
  },
  {
    section: "Finance",
    items: [
      { icon: Banknote, label: "Banque", href: "/staff/banklogs" },
      { icon: BarChart3, label: "Statistiques", href: "/staff/stats" },
    ],
  },
  {
    section: "Outils",
    items: [
      { icon: Calculator, label: "Calculateur Printer", href: "/staff/printers" },
      { icon: BookOpen, label: "Assistant Règlement", href: "/staff/reglement" },
      { icon: Settings, label: "Paramètres", href: "/staff/settings" },
    ],
  },
  {
    // Section visible par tout le staff. Liens vers les guides publics —
    // pratique pour les chefs qui veulent vérifier ou partager les règles.
    section: "Spécialisations",
    items: [
      { icon: Hammer,    label: "Construction", href: "/guide/build" },
      { icon: Handshake, label: "Négociation",  href: "/guide/negociation" },
      { icon: Car,       label: "Conduite",     href: "/guide/conduite" },
    ],
  },
];

interface SidebarProps {
  onClose?: () => void;
  isMobile?: boolean;
  // "full"      : Chef / Sous-Chef / EM → toutes les sections + toutes les actions.
  // "encadrant" : Encadrant → toutes les sections (visibilité complète) mais
  //               les actions sensibles (sanction, plainte, finalize…) sont
  //               bloquées côté API. L'UI doit aussi masquer ces boutons.
  // "recruiter" : Recruteur → Dashboard + Recrutement uniquement.
  accessLevel?: "full" | "encadrant" | "recruiter";
}

export function Sidebar({
  onClose,
  isMobile = false,
  accessLevel = "full",
}: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + "/");
  };

  // "Famille WL" est une page sensible — accessible Chef/Sous-Chef/EM uniquement.
  // Encadrant : exclu (ne peut pas modifier la WL, et l'API refuse aussi).
  // Recruteur : exclu (vue ultra-restreinte).
  // L'icône reste dans le code pour Chef/Sous-Chef/EM ; on filtre par accessLevel.
  const filterItem = (href: string): boolean => {
    if (href === "/staff/family" && accessLevel !== "full") return false;
    return true;
  };

  const baseSections = SIDEBAR_ITEMS.map((section) => ({
    ...section,
    items: section.items.filter((item) => filterItem(item.href)),
  })).filter((section) => section.items.length > 0);

  const visibleSections =
    accessLevel === "recruiter"
      ? [
          {
            section: "Principal",
            items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/staff/dashboard" }],
          },
          {
            section: "Recrutement",
            items: [{ icon: Briefcase, label: "Recrutement", href: "/staff/recruitment" }],
          },
          {
            section: "Outils",
            items: [{ icon: Calculator, label: "Calculateur Printer", href: "/printers" }],
          },
        ]
      : baseSections;

  return (
    // Pas de flex-1 sur la zone menu : on laisse le bloc se dimensionner à
    // son contenu pour que la déconnexion reste juste sous le dernier item,
    // peu importe la hauteur de la sidebar. Le scroll global est porté par
    // <nav> au cas où la liste dépasse l'écran.
    <nav className="flex h-full flex-col overflow-y-auto">
      {/* Sections */}
      <div className="px-3 py-6 space-y-5">
        {visibleSections.map((section, sectionIdx) => (
          <div key={section.section}>
            {sectionIdx > 0 && (
              // Séparateur dégradé : transparent → bordeaux faible → transparent
              <div className="mb-4 h-px bg-gradient-to-r from-transparent via-[#7a1f2b]/35 to-transparent" />
            )}
            <h3 className="flex items-center gap-2 px-3 pb-2 pt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
              {/* Mini point d'accent bordeaux devant chaque section */}
              <span
                className="h-1 w-1 rounded-full bg-[#c42a43]/70"
                style={{ boxShadow: "0 0 6px 0 rgba(196,42,67,0.55)" }}
              />
              {section.section}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <li key={item.href}>
                    <MotionListItem>
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={onClose}
                        className={[
                          // Transition unifiée 280ms cubic-bezier (cohérent avec le reste du panel)
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-[background-color,color,transform,box-shadow] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                          active
                            // Actif : gradient bordeaux + barre gauche bordeaux→ambre + glow extérieur
                            ? "bg-gradient-to-r from-[#7a1f2b]/55 via-[#7a1f2b]/22 to-transparent text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_20px_-6px_rgba(196,42,67,0.45)] border border-[#7a1f2b]/35"
                            // Inactif : hover gradient subtil + petit translateX
                            : "border border-transparent text-foreground/70 hover:bg-gradient-to-r hover:from-white/[0.06] hover:via-white/[0.025] hover:to-transparent hover:text-slate-100 hover:translate-x-0.5 hover:border-white/10",
                        ].join(" ")}
                      >
                        {/* Barre verticale d'accent active : dégradée bordeaux→ambre */}
                        {active && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-[#c42a43] via-[#9b2335] to-amber-500"
                            style={{ boxShadow: "0 0 10px 0 rgba(196,42,67,0.55)" }}
                          />
                        )}
                        <Icon
                          className={[
                            "h-4 w-4 flex-shrink-0 transition-all duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                            active
                              ? "text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.55)]"
                              : "text-slate-400 group-hover:text-amber-200/90 group-hover:drop-shadow-[0_0_4px_rgba(245,158,11,0.35)]",
                          ].join(" ")}
                        />
                        <span className={[
                          "truncate text-sm font-medium transition-colors",
                          active ? "tracking-[0.005em]" : "",
                        ].join(" ")}>
                          {item.label}
                        </span>
                      </Link>
                    </MotionListItem>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Mode léger (PC faibles) + Déconnexion */}
      <div className="mt-2 px-3 py-3 border-t border-white/8 space-y-2">
        <PerfModeToggle />
        <MotionButtonFrame className="w-full">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-slate-500 transition-colors hover:bg-red-500/12 hover:text-red-300 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_18px_-6px_rgba(220,38,38,0.35)]"
            asChild
          >
            <a href="/auth/signout">
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </a>
          </Button>
        </MotionButtonFrame>
      </div>
    </nav>
  );
}
