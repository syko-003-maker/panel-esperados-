"use client";

import Link from "next/link";
import Image from "next/image";

export default function StaffHeader() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
      {/* Logo */}
      <Link 
        href="/staff/dashboard" 
        className="group flex items-center gap-4 hover:opacity-80 transition-opacity"
      >
        <div className="relative w-12 h-12 rounded-lg overflow-hidden ring-2 ring-white/10 group-hover:ring-purple-500/30 transition-all">
          <Image
            src="/logo-esperados.svg"
            alt="Los Esperados"
            width={48}
            height={48}
            className="object-contain"
            priority
          />
        </div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-bold text-white tracking-tight">Los Esperados</h1>
          <p className="text-xs text-gray-400">Panel Interne</p>
        </div>
      </Link>

      {/* Staff Badge */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30">
        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
        <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Staff Panel</span>
      </div>
    </div>
  );
}
