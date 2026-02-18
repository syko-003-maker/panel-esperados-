"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  DollarSign,
  FileText,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";

const memberNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Banque",
    href: "/banque",
    icon: DollarSign,
  },
  {
    label: "Justifier une absence",
    href: "/justificatifs/absence",
    icon: FileText,
  },
  {
    label: "Justifier une sanction",
    href: "/justificatifs/sanction",
    icon: AlertTriangle,
  },
];

type MemberSidebarProps = {
  onCloseAction?: () => void;
  isMobile?: boolean;
};

export function MemberSidebar({ onCloseAction, isMobile }: MemberSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo & Branding */}
      <Link 
      href="/dashboard"
        className="group px-6 pt-6 pb-4 flex flex-col items-center gap-3 border-b border-white/10 hover:bg-white/5 transition-colors"
        onClick={() => isMobile && onCloseAction?.()}
      >
        <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-2 ring-white/10 group-hover:ring-emerald-500/30 transition-all shadow-lg shadow-emerald-500/10">
          <BrandLogo size={64} className="w-full h-full" />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Member Panel</span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto">
      <div className="space-y-2 p-4">
        {memberNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = !pathname ? false : pathname === item.href || pathname.startsWith(item.href + "/");
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && onCloseAction?.()}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400 shadow-lg shadow-emerald-500/20 border border-emerald-500/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-transform group-hover:scale-110",
                isActive ? "text-emerald-400" : "text-gray-500"
              )} />
              <span className="tracking-wide">{item.label}</span>
              {isActive && (
                <div className="ml-auto h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Help Section with Premium Style */}
      <div className="p-4 mt-6">
        <div className="rounded-xl bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-transparent border border-purple-500/20 p-4 backdrop-blur-xl">
          <p className="text-xs font-semibold text-purple-300 mb-2 uppercase tracking-wider">💡 Aide</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Pour modifier vos infos, utilisez <code className="px-1.5 py-0.5 bg-black/30 rounded text-purple-300">/link</code> sur Discord
          </p>
        </div>
      </div>
    </nav>
    </div>
  );
}
