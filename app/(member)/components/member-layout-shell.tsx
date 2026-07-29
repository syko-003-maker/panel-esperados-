"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AppBackground } from "@/components/app-background";
import { BrandLogo } from "@/components/BrandLogo";
import { MemberSidebar } from "./member-sidebar";
import { ScrollDriver } from "@/components/app-motion";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { Home, Landmark, Lightbulb, FileWarning, BookOpen } from "lucide-react";

const SIDEBAR_STYLE =
  "bg-[linear-gradient(180deg,rgba(31,18,44,0.88),hsl(var(--sunset-surface3)/0.96))] backdrop-blur-2xl border-r border-white/10";

// Cinq entrees maximum : au-dela, une barre basse devient illisible sur
// telephone. On garde ce qu'un membre ouvre reellement.
const BOTTOM_NAV = [
  { href: "/dashboard",    label: "Accueil",      icon: Home },
  { href: "/banque",       label: "Banque",       icon: Landmark },
  { href: "/suggestions",  label: "Suggestions",  icon: Lightbulb },
  { href: "/plaintes",     label: "Plainte",      icon: FileWarning },
  { href: "/reglement",    label: "Règlement",    icon: BookOpen },
];

export function MemberLayoutShell({
  children,
  isLinked,
  isRecruiter,
}: {
  children: React.ReactNode;
  isLinked: boolean;
  isRecruiter: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
      <div
        className="app-scene relative flex h-screen text-foreground overflow-hidden"
      >
        <AppBackground />
        <ScrollDriver />
        {/* Progression de lecture : discrete, mais elle donne le rythme. */}
        <div className="app-scroll-bar" aria-hidden />

        {/* Desktop sidebar */}
        <aside
          className={`relative z-10 hidden lg:flex lg:w-64 flex-col flex-shrink-0 ${SIDEBAR_STYLE}`}
        >
          <Link
            href="/dashboard"
            className="group flex flex-col items-center gap-3 border-b border-white/10 px-6 pt-6 pb-5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[0_18px_50px_-28px_rgba(251,191,36,0.35)] transition-all group-hover:ring-[hsl(var(--sunset-gold))]/40">
              <BrandLogo size={56} className="w-full h-full" />
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--sunset-magenta))]/35 bg-[hsl(var(--sunset-magenta))]/15 px-3 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                Espace Membre
              </span>
            </div>
          </Link>
          <MemberSidebar isLinked={isLinked} isRecruiter={isRecruiter} />
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile sidebar drawer */}
        <aside
          className={`fixed left-0 top-0 z-50 h-screen w-[min(256px,85vw)] flex flex-col ${SIDEBAR_STYLE} transition-transform duration-300 lg:hidden ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="relative h-8 w-8 overflow-hidden rounded-xl ring-1 ring-white/10">
                <BrandLogo size={32} className="w-full h-full" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Espace Membre
              </p>
            </Link>
            <div className="inline-flex">
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1 transition-colors hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
          </div>
          <MemberSidebar
            isLinked={isLinked}
            isRecruiter={isRecruiter}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {/* Main content */}
        <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-[linear-gradient(180deg,hsl(var(--sunset-surface3)/0.68),hsl(var(--sunset-surface3)/0.5))] px-4 backdrop-blur-xl lg:hidden">
            <div className="inline-flex">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.08]"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              Espace Membre
            </span>
          </header>

          <main data-app-scroll className="flex-1 overflow-y-auto">
            <div data-app-page className="w-full p-3 sm:p-4 md:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>

        <AppBottomNav items={BOTTOM_NAV} />
      </div>
  );
}
