"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { Home, DollarSign, FileText, Scale, LogOut, Users, AlertTriangle, Calendar, UserPlus, MessageSquare, Wallet, Settings } from "lucide-react";

type SidebarProps = {
  role: "member" | "staff" | "chef";
};

export function UnifiedSidebar({ role }: SidebarProps) {
  const pathname = usePathname() || "";

  // Member links
  const memberLinks = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/banque", label: "Banque", icon: DollarSign },
    { href: "/justificatifs/absence", label: "Justifier une absence", icon: FileText },
    { href: "/justificatifs/sanction", label: "Justifier une sanction", icon: Scale },
  ];

  // Staff links (complete menu)
  const staffLinks = [
    { href: "/staff/dashboard", label: "Dashboard", icon: Home },
    { href: "/staff/members", label: "Membres", icon: Users },
    { href: "/staff/sanctions", label: "Sanctions", icon: AlertTriangle },
    { href: "/staff/absences", label: "Absences", icon: Calendar },
    { href: "/staff/meetings", label: "Réunions", icon: Calendar },
    { href: "/staff/recruitment", label: "Recrutements", icon: UserPlus },
    { href: "/staff/complaints", label: "Plaintes", icon: MessageSquare },
    { href: "/staff/banklogs", label: "Banque", icon: Wallet },
    { href: "/staff/settings", label: "Paramètres", icon: Settings },
  ];

  const links = role === "member" ? memberLinks : staffLinks;
  const panelTitle = role === "member" ? "Member Panel" : "Staff Panel";
  const panelColor = role === "member" ? "emerald" : "purple";
  const disablePrefetch = role !== "member";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex flex-col w-64 h-screen bg-slate-950 border-r border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <Link
          href={role === "member" ? "/dashboard" : "/staff/dashboard"}
          prefetch={disablePrefetch ? false : undefined}
          className="flex items-center gap-3 group"
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden ring-2 ring-white/10 group-hover:ring-white/20 transition-all">
            <BrandLogo size={48} className="w-full h-full" />
          </div>
          <div>
            <p className="font-bold text-white">Los Esperados</p>
            <p
              className={`text-xs font-semibold uppercase tracking-wider text-${panelColor}-400`}
            >
              {panelTitle}
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={disablePrefetch ? false : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                active
                  ? `bg-${panelColor}-600/20 text-${panelColor}-400 border border-${panelColor}-500/30`
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer - Logout */}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
