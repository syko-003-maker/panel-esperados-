"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/staff/sidebar";

export function StaffLayout({
  children,
  accessLevel = "full",
}: {
  children: React.ReactNode;
  accessLevel?: "full" | "recruiter";
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
      sanctions: "Sanctions",
      absences: "Absences",
      banklogs: "Banque",
      stats: "Statistiques",
      activity: "Activité",
      meetings: "Réunions",
      discord: "Discord",
      link: "Liaison",
      settings: "Paramètres",
    };
    
    return titleMap[pageSlug] || "Staff Panel";
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar Desktop - Left Panel */}
      <aside className="hidden lg:flex lg:w-72 flex-col border-r border-border bg-card/50 backdrop-blur-sm">
        {/* Branding */}
        <Link
          href="/staff/dashboard"
          className="group flex h-auto flex-col items-center gap-3 border-b border-border px-6 pt-6 pb-4 hover:bg-white/5 transition-colors"
        >
          <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-2 ring-white/10 group-hover:ring-purple-500/30 transition-all shadow-lg shadow-purple-500/10">
            <BrandLogo size={64} className="w-full h-full" />
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Staff Panel</span>
          </div>
        </Link>

        {/* Navigation */}
        <Sidebar accessLevel={accessLevel} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-background/80 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 z-50 bg-card border-r border-border transition-transform duration-300 lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 border-b border-border px-6">
          <Link href="/staff/dashboard" className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden ring-2 ring-white/10 shadow-lg shadow-purple-500/10">
              <BrandLogo size={40} className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Los Esperados</h1>
              <p className="text-xs text-purple-400">Staff Panel</p>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          isMobile
          accessLevel={accessLevel}
        />
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 border-b border-border bg-card/50 backdrop-blur-sm px-4 md:px-6">
          {/* Left Side - Menu Toggle + Page Title */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-muted rounded-md transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold tracking-tight truncate">
              {getPageTitle()}
            </h2>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
