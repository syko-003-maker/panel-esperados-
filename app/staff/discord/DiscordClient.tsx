"use client";

import Link from "next/link";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { Bot, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DiscordClient() {
  return (
    <PageShell
      title="Paramètres"
      description="Configuration des intégrations Discord"
      icon={Bot}
    >
      <div className="grid gap-6">
        <SectionCard title="Pages Discord" description="Accès aux différentes sections de gestion Discord">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/staff/discord/config" className="block group">
              <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Config</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configuration des channels et paramètres Discord
                </p>
              </div>
            </Link>

            <Link href="/staff/discord/templates" className="block group">
              <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Templates</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Modèles de messages Discord réutilisables
                </p>
              </div>
            </Link>

            <Link href="/staff/discord/outbox" className="block group">
              <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Send className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Outbox</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Historique des messages envoyés
                </p>
              </div>
            </Link>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
