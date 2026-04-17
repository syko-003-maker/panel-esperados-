"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AppBackground } from "@/components/app-background";
import {
  StaffMotionProvider,
  MotionSection,
  MotionButtonFrame,
} from "@/components/staff/ui";
import { BrandLogo } from "@/components/BrandLogo";
import { MemberSidebar } from "./member-sidebar";

const SIDEBAR_STYLE =
  "bg-[linear-gradient(180deg,rgba(18,5,8,0.85),rgba(11,3,5,0.95))] backdrop-blur-2xl border-r border-white/10";

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
    <StaffMotionProvider>
      <div className="relative flex h-screen text-foreground overflow-hidden">
        <AppBackground />

        {/* Desktop sidebar */}
        <aside
          className={`relative z-10 hidden lg:flex lg:w-64 flex-col flex-shrink-0 ${SIDEBAR_STYLE}`}
        >
          <Link
            href="/dashboard"
            className="group flex flex-col items-center gap-3 border-b border-white/10 px-6 pt-6 pb-5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-[0_18px_50px_-28px_rgba(245,158,11,0.25)] transition-all group-hover:ring-amber-400/30">
              <BrandLogo size={56} className="w-full h-full" />
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#7a1f2b]/35 bg-[#7a1f2b]/20 px-3 py-1">
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
          className={`fixed left-0 top-0 z-50 h-screen w-64 flex flex-col ${SIDEBAR_STYLE} transition-transform duration-300 lg:hidden ${
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
            <MotionButtonFrame>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1 transition-colors hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </MotionButtonFrame>
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
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(11,3,5,0.62),rgba(11,3,5,0.46))] px-4 backdrop-blur-xl lg:hidden">
            <MotionButtonFrame>
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.08]"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </MotionButtonFrame>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              Espace Membre
            </span>
          </header>

          <main className="flex-1 overflow-y-auto">
            <MotionSection className="w-full p-4 md:p-6 lg:p-8">
              {children}
            </MotionSection>
          </main>
        </div>
      </div>
    </StaffMotionProvider>
  );
}
