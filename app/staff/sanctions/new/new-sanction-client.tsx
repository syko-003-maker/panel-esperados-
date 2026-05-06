"use client";

import { getErrorMessage } from "@/lib/errors";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSanctionLabel } from "@/lib/sanctions";

const TYPES = ["AVERT_ORAL_PLAYTIME", "AVERT_ORAL_REUNION", "AVERT_LEGER", "AVERT_LOURD", "DEMOTE", "RESERVISTE", "BLACKLIST"] as const;

const SANCTION_TYPE_OPTIONS = TYPES.map((value) => ({
  value,
  label: getSanctionLabel(value),
}));

type SanctionType = (typeof TYPES)[number];

export default function NewSanctionClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    memberDiscordId: "",
    type: "AVERT_ORAL_PLAYTIME" as SanctionType,
    reason: "",
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      memberDiscordId: form.memberDiscordId.trim(),
      type: form.type,
      reason: form.reason.trim(),
    };

    try {
      const res = await fetch("/api/staff/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");
      router.push(`/staff/sanctions/${json.sanction.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-[rgba(14,5,7,0.70)] p-6 shadow-[0_18px_60px_-28px_rgba(0,0,0,0.75)]">
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-slate-100">Discord ID du membre</span>
        <Input
          className="h-12 rounded-xl border-white/10 bg-card/80 px-4 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-[#9b2335]/60"
          value={form.memberDiscordId}
          onChange={(e) => setForm((prev) => ({ ...prev, memberDiscordId: e.target.value }))}
          placeholder="123456789012345678"
          required
        />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-slate-100">Type</span>
        <Select
          value={form.type}
          onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as SanctionType }))}
        >
          <SelectTrigger className="h-12 rounded-xl border-white/10 bg-card/80 px-4 text-left text-slate-100 focus:ring-2 focus:ring-[#9b2335]/60 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[rgba(14,5,7,0.98)] text-slate-100 shadow-2xl">
            {SANCTION_TYPE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="rounded-md py-2.5 text-sm text-slate-100 focus:bg-[#7a1f2b]/30 focus:text-white"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-semibold text-slate-100">Raison</span>
        <Textarea
          className="min-h-[112px] rounded-xl border-white/10 bg-card/80 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-[#9b2335]/60"
          rows={3}
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          placeholder="Préciser le contexte de la sanction"
          required
        />
      </label>

      <Button
        type="submit"
        disabled={saving}
        className="h-12 w-full rounded-xl bg-gradient-to-r from-[#7a1f2b] to-[#9b2335] text-sm font-semibold text-white shadow-[0_14px_30px_-14px_rgba(155,35,53,0.60)] hover:from-[#8a2535] hover:to-[#b02840] transition-all"
      >
        {saving ? "Création..." : "Créer la sanction"}
      </Button>
    </form>
  );
}
