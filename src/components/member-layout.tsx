"use client";

import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { MemberSidebar } from "@/components/member/sidebar";

export function MemberLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 flex-col border-r border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl">
        <MemberSidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/80 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 z-50 bg-black/20 backdrop-blur-xl border-r border-white/10 transition-transform duration-300 lg:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <MemberSidebar onCloseAction={() => setMobileMenuOpen(false)} isMobile />
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b border-white/10 bg-black/10 backdrop-blur-xl">
          {/* Mobile Menu Toggle */}
          <button
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-gray-400" />
            ) : (
              <Menu className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {/* Page Title (Desktop) */}
          <div className="hidden lg:block">
            <h2 className="text-sm font-semibold text-white">Espace Membre</h2>
          </div>

          {/* Right Actions */}
          <div className="ml-auto flex items-center gap-4">
            <a
              href="/auth/signout"
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </a>
          </div>
        </header>

        {/* Main Content with Scroll */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
