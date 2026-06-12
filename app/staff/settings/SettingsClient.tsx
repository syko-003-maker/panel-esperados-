"use client";

import Link from "next/link";
import { PageShell, SectionCard } from "@/components/staff/ui";
import { Bot, ClipboardList, FileText, KeyRound, Send, Server, ShieldCheck } from "lucide-react";

export default function SettingsClient() {
  return (
    <PageShell
      title="Paramètres"
      description="Configuration des intégrations Discord"
      icon={Bot}
    >
      <div className="grid gap-6">
        <SectionCard title="Accès & sécurité" description="Qui a le droit de faire quoi sur le panel (réservé Chef / Sous-Chef)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/staff/settings/access" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Autorisations</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Donner ou retirer les accès panel (État-Major, Encadrant, Recruteur) et resynchroniser un membre
                </p>
              </div>
            </Link>

            <Link href="/staff/settings/lyg-cookie" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <KeyRound className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Cookie LYG admin</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Session families.lyg.fr pour les actions WL en temps réel
                </p>
              </div>
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Recrutement" description="Questionnaires d'entretien utilisés par les recruteurs (accessible État-Major et Chefs)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/staff/settings/recruitment-models" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ClipboardList className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Modèles de recrutement</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Créer plusieurs types de tests — le recruteur choisit au lancement de l&apos;entretien
                </p>
              </div>
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Pages Discord" description="Accès aux différentes sections de gestion Discord">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/staff/settings/config" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
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

            <Link href="/staff/settings/templates" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
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

            <Link href="/staff/settings/outbox" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
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

        <SectionCard title="Système" description="Monitoring du VPS, des services et de l'API LYG">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/staff/system" className="block group">
              <div className="premium-card premium-card-bordeaux p-6 rounded-lg border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Server className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Système & API LYG</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  CPU, RAM, disque, services et consommation API LYG en temps réel
                </p>
              </div>
            </Link>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
