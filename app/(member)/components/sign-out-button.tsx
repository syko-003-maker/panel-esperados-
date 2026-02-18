"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirect: true, callbackUrl: "/login" })}
      className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors duration-200 flex items-center gap-2"
    >
      <span>🚪</span>
      Déconnexion
    </button>
  );
}
