"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Banknote,
  CalendarOff,
  Scale,
  Briefcase,
  LogOut,
  Hammer,
  Handshake,
  Car,
  GraduationCap,
  Calculator,
} from "lucide-react";

type NavItem = { href: string; label: string; Icon: React.ElementType; external?: boolean };
type NavSection = { title: string; items: NavItem[] };

function getSections(isLinked: boolean, isRecruiter: boolean): NavSection[] {
  if (!isLinked) {
    return [
      {
        title: "Mon espace",
        items: [{ href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard }],
      },
    ];
  }

  const sections: NavSection[] = [
    {
      title: "Mon espace",
      items: [
        { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
        { href: "/banque", label: "Banque", Icon: Banknote },
        { href: "/justificatifs/absence", label: "Justifier une absence", Icon: CalendarOff },
        { href: "/justificatifs/sanction", label: "Justifier une sanction", Icon: Scale },
      ],
    },
    {
      title: "Spécialisations",
      items: [
        { href: "/guide/build", label: "Construction", Icon: Hammer },
        { href: "/guide/negociation", label: "Négociation", Icon: Handshake },
        { href: "/guide/conduite", label: "Conduite", Icon: Car },
      ],
    },
    {
      title: "Outils",
      items: [{ href: "/printers", label: "Calculateur Printer", Icon: Calculator }],
    },
  ];

  if (isRecruiter) {
    sections[0].items.push({ href: "/recrutement", label: "Recrutement", Icon: Briefcase });
  }

  return sections;
}

export function MemberSidebar({
  isLinked = true,
  isRecruiter = false,
  onClose,
}: {
  isLinked?: boolean;
  isRecruiter?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname() || "";
  const sections = getSections(isLinked, isRecruiter);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-5">
        {sections.map((section, idx) => (
          <div key={section.title}>
            {idx > 0 && (
              // Séparateur dégradé bordeaux entre sections — cohérent avec la
              // sidebar staff.
              <div className="mb-4 h-px bg-gradient-to-r from-transparent via-[#7a1f2b]/35 to-transparent" />
            )}
            <h3 className="flex items-center gap-2 px-3 pb-2 pt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55">
              <span
                aria-hidden
                className="h-1 w-1 rounded-full bg-[#c42a43]/70"
                style={{ boxShadow: "0 0 6px 0 rgba(196,42,67,0.55)" }}
              />
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={onClose}
                      className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-200 ease-in-out ${
                        active
                          ? "border-[#7a1f2b]/35 bg-[#7a1f2b]/18 text-slate-50 shadow-[0_14px_32px_-26px_rgba(122,31,43,0.60)]"
                          : "border-transparent text-foreground/80 hover:border-white/8 hover:bg-white/[0.04] hover:text-foreground"
                      }`}
                    >
                      <item.Icon
                        className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${
                          active
                            ? "text-amber-300 opacity-100"
                            : "opacity-70 group-hover:opacity-100"
                        }`}
                      />
                      <span className="truncate text-sm font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {!isLinked && (
        <div className="mx-3 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Contactez un Chef, Recruteur ou État-Major sur Discord pour lier votre compte.
          </p>
        </div>
      )}

      <div className="px-3 py-4 border-t border-white/10">
        <div className="w-full">
          <button
            onClick={() => signOut({ redirect: true, callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-destructive/70 transition-all duration-200 hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">Déconnexion</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
