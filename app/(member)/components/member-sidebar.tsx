"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function MemberSidebar({ isLinked = true }: { isLinked?: boolean }) {
  const pathname = usePathname() || "";
  const [isOpen, setIsOpen] = useState(true);

  const links = isLinked
    ? [
        { href: "/dashboard", label: "Dashboard", icon: "📊" },
        { href: "/banque", label: "Banque", icon: "💰" },
        { href: "/justificatifs/absence", label: "Justifier une absence", icon: "📋" },
        { href: "/justificatifs/sanction", label: "Justifier une sanction", icon: "⚖️" },
      ]
    : [{ href: "/dashboard", label: "Dashboard", icon: "📊" }];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <div
        className={`fixed md:relative z-50 h-full transition-all duration-300 ${
          isOpen ? "w-64" : "w-20"
        } bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-700`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          {isOpen && (
            <h1 className="text-lg font-bold text-white truncate">Member Panel</h1>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="hidden md:flex p-2 rounded hover:bg-slate-700 transition"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive(link.href)
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              {isOpen && <span className="text-sm">{link.label}</span>}
            </Link>
          ))}
        </nav>

        {!isLinked && isOpen && (
          <div className="mx-3 mb-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
            <p className="text-xs text-yellow-200">
              Contactez un Chef, Recruteur ou État-Major sur Discord pour lier votre compte.
            </p>
          </div>
        )}

        {/* Logout */}
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={() => signOut({ redirect: true, callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-colors duration-200"
          >
            <span className="text-lg">🚪</span>
            {isOpen && <span className="text-sm">Déconnexion</span>}
          </button>
        </div>
      </div>

      {/* Mobile Toggle */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed bottom-4 right-4 p-3 rounded-lg bg-blue-600 text-white shadow-lg z-40"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
