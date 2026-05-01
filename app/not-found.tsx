import Link from "next/link";
import { AppBackground } from "@/components/app-background";
import { BrandLogo } from "@/components/BrandLogo";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <AppBackground />

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full">
        {/* Logo */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_60px_-20px_rgba(155,35,53,0.5)] ring-1 ring-[#9b2335]/30">
          <BrandLogo size={80} className="w-full h-full" />
        </div>

        {/* Code */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#9b2335]/35 bg-[#9b2335]/15 px-4 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Erreur 404</span>
        </div>

        {/* Title */}
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          Page introuvable
        </h1>

        {/* Description */}
        <p className="mb-8 text-base leading-relaxed text-slate-400 max-w-sm">
          Cette page n&apos;existe pas ou a été déplacée. Retourne au dashboard pour continuer.
        </p>

        {/* CTA */}
        <Link
          href="/staff/dashboard"
          className="inline-flex items-center gap-2 rounded-2xl border border-[#9b2335]/40 bg-gradient-to-r from-[#7a1f2b] to-[#9b2335] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(155,35,53,0.6)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_rgba(155,35,53,0.8)]"
        >
          ← Retour au Dashboard
        </Link>

        {/* Subtle grid decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(155,35,53,0.08)_0%,transparent_70%)]" />
        </div>
      </div>
    </div>
  );
}
