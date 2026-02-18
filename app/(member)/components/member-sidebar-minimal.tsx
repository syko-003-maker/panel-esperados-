"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";

/**
 * Minimal sidebar for non-linked members
 * Shows only Dashboard and Logout options
 */
export function MemberSidebarMinimal() {
  return (
    <div className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white truncate">Member Panel</h1>
      </div>

      {/* Navigation - Minimal */}
      <nav className="flex-1 px-3 py-4 space-y-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <span className="text-lg">📊</span>
          <span className="text-sm">Dashboard</span>
        </Link>
      </nav>

      {/* Info Box */}
      <div className="mx-3 mb-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
        <p className="text-xs text-yellow-200">
          Contactez un Chef, Recruteur ou État-Major sur Discord pour lier votre compte.
        </p>
      </div>

      {/* Logout */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={() => signOut({ redirect: true, callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-colors duration-200"
        >
          <span className="text-lg">🚪</span>
          <span className="text-sm">Déconnexion</span>
        </button>
      </div>
    </div>
  );
}
