"use client";

import { useState } from "react";
import { ScrollDriver } from "@/components/app-motion";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { LayoutDashboard, Users, ShieldAlert, Landmark, Inbox } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { AppBackground } from "@/components/app-background";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/staff/sidebar";
import {
  MotionButtonFrame,
  MotionSection,
  MotionPageTransition,
  StaffMotionProvider,
} from "@/components/staff/ui";

// Les cinq sections que le staff ouvre le plus. Une barre basse au-dela de
// cinq entrees devient illisible sur telephone.
const STAFF_BOTTOM_NAV = [
  { href: "/staff/dashboard",    label: "Accueil",    icon: LayoutDashboard },
  { href: "/staff/members",      label: "Membres",    icon: Users },
  { href: "/staff/recruitments", label: "Recrut.",    icon: Inbox },
  { href: "/staff/sanctions",    label: "Sanctions",  icon: ShieldAlert },
  { href: "/staff/banklogs",     label: "Banque",     icon: Landmark },
];

export function StaffLayout({
  children,
  accessLevel = "full",
  user,
}: {
  children: React.ReactNode;
  accessLevel?: "full" | "encadrant" | "recruiter";
  user?: { name?: string | null; image?: string | null };
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const getPageTitle = () => {
    if (!pathname) return "Staff Panel";
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) return "Staff Panel";
    
    const pageSlug = segments[1];
    const titleMap: Record<string, string> = {
      dashboard: "Dashboard",
      members: "Membres",
      recruitment: "Recrutement",
      recruitments: "Recrutements",
      complaints: "Plaintes",
      "complaints-tickets": "Plaintes",
      sanctions: "Sanctions",
      absences: "Absences",
      warns: "Warns in-game",
      banklogs: "Banque",
      stats: "Statistiques",
      activity: "Activité",
      meetings: "Réunions",
      discord: "Discord",
      link: "Liaison",
      settings: "Paramètres",
      logs: "Logs",
      config: "Configuration",
    };
    
    return titleMap[pageSlug] || "Staff Panel";
  };

  return (
    <StaffMotionProvider>
      {/* app-scene, ScrollDriver et la barre de progression sont INERTES sur le
          site : leurs styles sont tous prefixes par [data-display="app"]. Ils ne
          prennent vie que dans l_application installee. */}
      <div className="app-scene relative flex min-h-screen text-foreground">
        <ScrollDriver />
        <div className="app-scroll-bar" aria-hidden />
        <AppBackground />
        <aside className="relative z-10 hidden lg:flex lg:w-72 flex-col border-r border-white/10 bg-[linear-gradient(180deg,hsl(var(--sunset-surface3)/0.72),hsl(var(--sunset-surface)/0.90))] backdrop-blur-2xl">
          <Link
            href="/staff/dashboard"
            className="group flex h-auto flex-col items-center gap-3 border-b border-white/10 px-6 pt-6 pb-5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[0_18px_50px_-28px_rgba(245,158,11,0.25)] transition-all group-hover:ring-amber-400/30">
              <BrandLogo size={64} className="w-full h-full" />
      
        <AppBottomNav items={STAFF_BOTTOM_NAV} />
      </div>
            <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--sunset-deep))]/35 bg-[hsl(var(--sunset-deep))]/20 px-3 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">Staff Panel</span>
            </div>
          </Link>

          <Sidebar accessLevel={accessLevel} />
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed left-0 top-0 z-50 h-screen w-[min(288px,85vw)] border-r border-white/10 bg-[linear-gradient(180deg,hsl(var(--sunset-surface3)/0.93),hsl(var(--sunset-surface)/0.98))] backdrop-blur-2xl transition-transform duration-300 lg:hidden ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
            <Link href="/staff/dashboard" className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_18px_50px_-28px_rgba(245,158,11,0.20)]">
                <BrandLogo size={40} className="w-full h-full" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight text-slate-100">Los Esperados</h1>
                <p className="text-xs text-amber-300">Staff Panel</p>
              </div>
            </Link>
            <MotionButtonFrame>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Fermer la sidebar"
                className="rounded-md p-2 transition-colors hover:bg-muted min-h-10 min-w-10"
              >
                <X className="h-5 w-5" />
              </button>
            </MotionButtonFrame>
          </div>
          <Sidebar
            onClose={() => setSidebarOpen(false)}
            isMobile
            accessLevel={accessLevel}
          />
        </aside>

        <div className="relative z-10 flex flex-1 flex-col overflow-hidden min-w-0">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[linear-gradient(180deg,hsl(var(--sunset-surface)/0.62),hsl(var(--sunset-surface)/0.46))] px-4 backdrop-blur-xl md:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <MotionButtonFrame className="lg:hidden">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.08]"
                  aria-label="Toggle sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </MotionButtonFrame>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight text-slate-50">{getPageTitle()}</h2>
              </div>
            </div>

            {/* Connected user */}
            {user && (
              <div className="flex items-center gap-2.5 pl-4">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name ?? ""}
                    className="h-9 w-9 rounded-full border border-white/10 object-cover sm:h-8 sm:w-8"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[hsl(var(--sunset-deep))]/40 text-xs font-bold text-amber-200 sm:h-8 sm:w-8">
                    {(user.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:block max-w-[120px] truncate text-sm font-medium text-slate-300">
                  {user.name ?? "—"}
                </span>
              </div>
            )}
          </header>

          <main data-app-scroll className="flex-1 overflow-y-auto">
            <div data-app-page className="contents">
            <MotionSection className="w-full p-3 sm:p-4 md:p-6 lg:p-8">
              <MotionPageTransition pathname={pathname ?? ""}>
                {children}
              </MotionPageTransition>
            </MotionSection>
            </div>
          </main>
        </div>
      </div>
    </StaffMotionProvider>
  );
}
