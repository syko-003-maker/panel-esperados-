"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

/**
 * Barre de navigation basse — le signal « application » le plus fort sur
 * téléphone.
 *
 * Un site se navigue par un menu qu'on ouvre ; une application a ses
 * destinations principales sous le pouce, en permanence. C'est cette différence
 * qu'on installe ici.
 *
 * Elle n'apparaît QUE dans l'application installée et QUE sur petit écran :
 * sur un grand écran la barre latérale reste plus efficace, et sur le site on
 * ne change rien.
 */
export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function AppBottomNav({ items }: { items: BottomNavItem[] }) {
  // usePathname peut renvoyer null au tout premier rendu.
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="app-bottom-nav"
      aria-label="Navigation principale"
    >
      {items.map((item) => {
        // On considère la section active dès qu'on est dans une de ses
        // sous-pages, sinon l'onglet s'éteint dès qu'on ouvre un détail.
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`app-bottom-nav-item ${active ? "is-active" : ""}`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
