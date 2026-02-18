"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  Link2,
  BarChart3,
  MessageSquare,
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
      { icon: Briefcase, label: "Recrutement", href: "/staff/recruitment" },
      { icon: FileText, label: "Plaintes", href: "/staff/complaints" },
      { icon: AlertCircle, label: "Sanctions", href: "/staff/sanctions" },
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
      { icon: MessageSquare, label: "Activité", href: "/staff/activity" },
      { icon: Link2, label: "Liaison", href: "/staff/link" },
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
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Logout Button */}
      <div className="px-3 py-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          asChild
        >
          <a href="/auth/signout">
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </a>
        </Button>
      </div>
    </nav>
  );
}
