"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
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
} from "lucide-react";

const SIDEBAR_ITEMS = [
  {
    section: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/staff/dashboard" },
      { icon: Users, label: "Membres", href: "/staff/members" },
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
      { icon: Settings, label: "Paramètres", href: "/staff/settings" },
    ],
  },
];

interface SidebarProps {
  onClose?: () => void;
  isMobile?: boolean;
  accessLevel?: "full" | "recruiter";
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
        ]
      : SIDEBAR_ITEMS;

  return (
    <nav className="flex flex-col h-full">
      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-8">
        {visibleSections.map((section) => (
          <div key={section.section}>
            <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ease-in-out ${
                          active
                            ? "bg-[#7a1f2b]/40 text-slate-50 shadow-[inset_3px_0_0_#c42a43,0_4px_20px_-4px_rgba(196,42,67,0.40)]"
                            : "text-foreground/70 hover:bg-white/[0.05] hover:text-slate-100"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${
                            active
                              ? "text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                              : "opacity-70 group-hover:opacity-100"
                          }`}
                        />
                        <span className="truncate text-sm font-medium">
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

      {/* Logout Button */}
      <div className="px-3 py-4 border-t border-border">
        <MotionButtonFrame className="w-full">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
