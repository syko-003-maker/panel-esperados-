"use client";

import { getErrorMessage } from "@/lib/errors";

import { useEffect, useState } from "react";
import { Settings, Save, RotateCcw, CheckCircle2, AlertCircle, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/staff/ui/PageShell";
import { Separator } from "@/components/ui/separator";

type DiscordConfig = {
  familyId: string;
  recruitmentChannelId: string | null;
  complaintsChannelId: string | null;
  complaintCategoryId: string | null;
  meetingsChannelId: string | null;
  absencesChannelId: string | null;
  sanctionsChannelId: string | null;
  logsChannelId: string | null;
  bankAlertsChannelId: string | null;
  bankDebtPingThreshold: number | null;
  bankDebtPingEnabled: boolean;
  bankDebtPingCooldownMinutes: number;
  staffRoleId: string | null;
};

type FormState = {
  recruitmentChannelId: string;
  complaintsChannelId: string;
  complaintCategoryId: string;
  meetingsChannelId: string;
  absencesChannelId: string;
  sanctionsChannelId: string;
  logsChannelId: string;
  bankAlertsChannelId: string;
  bankDebtPingThreshold: string;
  bankDebtPingEnabled: boolean;
  bankDebtPingCooldownMinutes: string;
  staffRoleId: string;
};

type ValidationErrors = Partial<Record<keyof FormState, string>>;

const DEV_DEFAULTS = {
  absencesChannelId: "1335303582043607222",
  sanctionsChannelId: "1409028569203740792",
  bankAlertsChannelId: "1389709088119853109",
};

const IS_DEV = process.env.NODE_ENV !== "production";

function withDevDefault(value: string | null | undefined, fallback: string) {
  if (value && value.trim()) return value;
  return IS_DEV ? fallback : "";
}

function validateDiscordId(value: string): boolean {
  if (!value || !value.trim()) return true; // Empty is valid (optional)
  return /^\d{17,20}$/.test(value.trim());
}

export default function DiscordConfigClient() {
  const [originalConfig, setOriginalConfig] = useState<DiscordConfig | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  async function load() {
    setError(null);
    const res = await fetch("/api/staff/discord/config?familyId=esperados", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Échec du chargement de la configuration");
      return;
    }
    const cfg = json.config as DiscordConfig;
    setOriginalConfig(cfg);
    const formData: FormState = {
      recruitmentChannelId: cfg.recruitmentChannelId ?? "",
      complaintsChannelId: cfg.complaintsChannelId ?? "",
      complaintCategoryId: cfg.complaintCategoryId ?? "",
      meetingsChannelId: cfg.meetingsChannelId ?? "",
      absencesChannelId: withDevDefault(cfg.absencesChannelId, DEV_DEFAULTS.absencesChannelId),
      sanctionsChannelId: withDevDefault(cfg.sanctionsChannelId, DEV_DEFAULTS.sanctionsChannelId),
      logsChannelId: cfg.logsChannelId ?? "",
      bankAlertsChannelId: withDevDefault(cfg.bankAlertsChannelId, DEV_DEFAULTS.bankAlertsChannelId),
      bankDebtPingThreshold: cfg.bankDebtPingThreshold ? String(cfg.bankDebtPingThreshold) : "",
      bankDebtPingEnabled: Boolean(cfg.bankDebtPingEnabled),
      bankDebtPingCooldownMinutes: String(cfg.bankDebtPingCooldownMinutes ?? 60),
      staffRoleId: cfg.staffRoleId ?? "",
    };
    setForm(formData);
  }

  useEffect(() => {
    load();
  }, []);

  function validateForm(): boolean {
    if (!form) return false;
    const errors: ValidationErrors = {};

    const idFields: (keyof FormState)[] = [
      "recruitmentChannelId",
      "complaintsChannelId",
      "complaintCategoryId",
      "meetingsChannelId",
      "absencesChannelId",
      "sanctionsChannelId",
      "logsChannelId",
      "bankAlertsChannelId",
      "staffRoleId",
    ];

    idFields.forEach((field) => {
      const value = form[field] as string;
      if (value && value.trim() && !validateDiscordId(value)) {
        errors[field] = "ID Discord invalide (17-20 chiffres)";
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;

    if (!validateForm()) {
      setError("Veuillez corriger les erreurs de validation");
      return;
    }

    setSaving(true);
    setOkMsg(null);
    setError(null);

    const payload = {
      familyId: "esperados",
      ...form,
    };

    try {
      const res = await fetch("/api/staff/discord/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec de la sauvegarde");
      
      setOkMsg("✓ Configuration sauvegardée");
      setTimeout(() => setOkMsg(null), 3000);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (originalConfig) {
      const formData: FormState = {
        recruitmentChannelId: originalConfig.recruitmentChannelId ?? "",
        complaintsChannelId: originalConfig.complaintsChannelId ?? "",
        complaintCategoryId: originalConfig.complaintCategoryId ?? "",
        meetingsChannelId: originalConfig.meetingsChannelId ?? "",
        absencesChannelId: withDevDefault(originalConfig.absencesChannelId, DEV_DEFAULTS.absencesChannelId),
        sanctionsChannelId: withDevDefault(originalConfig.sanctionsChannelId, DEV_DEFAULTS.sanctionsChannelId),
        logsChannelId: originalConfig.logsChannelId ?? "",
        bankAlertsChannelId: withDevDefault(originalConfig.bankAlertsChannelId, DEV_DEFAULTS.bankAlertsChannelId),
        bankDebtPingThreshold: originalConfig.bankDebtPingThreshold ? String(originalConfig.bankDebtPingThreshold) : "",
        bankDebtPingEnabled: Boolean(originalConfig.bankDebtPingEnabled),
        bankDebtPingCooldownMinutes: String(originalConfig.bankDebtPingCooldownMinutes ?? 60),
        staffRoleId: originalConfig.staffRoleId ?? "",
      };
      setForm(formData);
      setValidationErrors({});
      setError(null);
      setOkMsg(null);
    }
  }

  if (!form) {
    return (
      <PageShell title="Configuration Discord" icon={Settings}>
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>{error}</div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        )}
      </PageShell>
    );
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify({
    recruitmentChannelId: originalConfig?.recruitmentChannelId ?? "",
    complaintsChannelId: originalConfig?.complaintsChannelId ?? "",
    complaintCategoryId: originalConfig?.complaintCategoryId ?? "",
    meetingsChannelId: originalConfig?.meetingsChannelId ?? "",
    absencesChannelId: withDevDefault(originalConfig?.absencesChannelId, DEV_DEFAULTS.absencesChannelId),
    sanctionsChannelId: withDevDefault(originalConfig?.sanctionsChannelId, DEV_DEFAULTS.sanctionsChannelId),
    logsChannelId: originalConfig?.logsChannelId ?? "",
    bankAlertsChannelId: withDevDefault(originalConfig?.bankAlertsChannelId, DEV_DEFAULTS.bankAlertsChannelId),
    bankDebtPingThreshold: originalConfig?.bankDebtPingThreshold ? String(originalConfig.bankDebtPingThreshold) : "",
    bankDebtPingEnabled: Boolean(originalConfig?.bankDebtPingEnabled),
    bankDebtPingCooldownMinutes: String(originalConfig?.bankDebtPingCooldownMinutes ?? 60),
    staffRoleId: originalConfig?.staffRoleId ?? "",
  });

  return (
    <PageShell
      title="Configuration Discord"
      description="Configurer les canaux et paramètres Discord de la famille"
      icon={Settings}
    >
      <form onSubmit={onSave} className="space-y-6">
        {/* Success/Error Messages */}
        {okMsg && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <div>{okMsg}</div>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Section A: Tickets */}
        <ConfigSection
          title="Tickets"
          description="Système de tickets Discord"
          fields={[
            {
              name: "logsChannelId",
              label: "Canal Logs (optionnel)",
              value: form.logsChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal pour les logs des tickets",
              error: validationErrors.logsChannelId,
              onChange: (value) => setForm({ ...form, logsChannelId: value }),
            },
          ]}
        />

        {/* Section B: Recruitment */}
        <ConfigSection
          title="Recrutement"
          description="Système de recrutement"
          fields={[
            {
              name: "recruitmentChannelId",
              label: "Canal Recrutement",
              value: form.recruitmentChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal où les recrutements sont postés",
              error: validationErrors.recruitmentChannelId,
              onChange: (value) => setForm({ ...form, recruitmentChannelId: value }),
            },
          ]}
        />

        {/* Section C: Complaints */}
        <ConfigSection
          title="Plaintes"
          description="Système de plaintes"
          fields={[
            {
              name: "complaintsChannelId",
              label: "Canal Plaintes",
              value: form.complaintsChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal où les plaintes sont postées",
              error: validationErrors.complaintsChannelId,
              onChange: (value) => setForm({ ...form, complaintsChannelId: value }),
            },
            {
              name: "complaintCategoryId",
              label: "Catégorie Plaintes",
              value: form.complaintCategoryId,
              placeholder: "ID de la catégorie (17-20 chiffres)",
              helper: "Catégorie Discord pour organiser les tickets de plainte",
              error: validationErrors.complaintCategoryId,
              onChange: (value) => setForm({ ...form, complaintCategoryId: value }),
            },
          ]}
        />

        {/* Section D: Meetings */}
        <ConfigSection
          title="Réunions"
          description="Système de réunions"
          fields={[
            {
              name: "meetingsChannelId",
              label: "Canal Réunions",
              value: form.meetingsChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal où les réunions sont annoncées",
              error: validationErrors.meetingsChannelId,
              onChange: (value) => setForm({ ...form, meetingsChannelId: value }),
            },
          ]}
        />

        {/* Section E: Sanctions */}
        <ConfigSection
          title="Sanctions"
          description="Système de sanctions"
          fields={[
            {
              name: "sanctionsChannelId",
              label: "Canal Sanctions",
              value: form.sanctionsChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal où les sanctions sont notifiées",
              error: validationErrors.sanctionsChannelId,
              onChange: (value) => setForm({ ...form, sanctionsChannelId: value }),
            },
            {
              name: "absencesChannelId",
              label: "Canal Absences",
              value: form.absencesChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal où les absences sont postées",
              error: validationErrors.absencesChannelId,
              onChange: (value) => setForm({ ...form, absencesChannelId: value }),
            },
          ]}
        />

        {/* Section F: Banque */}
        <ConfigSection
          title="Banque"
          description="Alertes et rappels de dettes"
          fields={[
            {
              name: "bankAlertsChannelId",
              label: "Canal Alertes Banque",
              value: form.bankAlertsChannelId,
              placeholder: "ID du canal (17-20 chiffres)",
              helper: "Canal pour les alertes de dettes",
              error: validationErrors.bankAlertsChannelId,
              onChange: (value) => setForm({ ...form, bankAlertsChannelId: value }),
            },
            {
              name: "bankDebtPingThreshold",
              label: "Seuil Rappel Dette (optionnel)",
              value: form.bankDebtPingThreshold,
              placeholder: "Montant minimum",
              helper: "Montant minimum pour déclencher un rappel automatique",
              type: "number",
              onChange: (value) => setForm({ ...form, bankDebtPingThreshold: value }),
            },
            {
              name: "bankDebtPingCooldownMinutes",
              label: "Cooldown Rappel (minutes)",
              value: form.bankDebtPingCooldownMinutes,
              placeholder: "60",
              helper: "Délai minimum entre deux rappels pour un même membre",
              type: "number",
              onChange: (value) => setForm({ ...form, bankDebtPingCooldownMinutes: value }),
            },
          ]}
        >
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/20">
            <div>
              <div className="text-sm font-medium text-foreground">Rappels de dettes activés</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Envoyer automatiquement des rappels Discord aux membres endettés
              </p>
            </div>
            <Switch
              checked={form.bankDebtPingEnabled}
              onCheckedChange={(checked) => setForm({ ...form, bankDebtPingEnabled: checked })}
            />
          </div>
        </ConfigSection>

        {/* Section G: Roles */}
        <ConfigSection
          title="Rôles"
          description="Configuration des rôles Discord"
          fields={[
            {
              name: "staffRoleId",
              label: "Rôle Staff (optionnel)",
              value: form.staffRoleId,
              placeholder: "ID du rôle (17-20 chiffres)",
              helper: "Rôle Discord pour identifier les membres du staff",
              error: validationErrors.staffRoleId,
              onChange: (value) => setForm({ ...form, staffRoleId: value }),
            },
          ]}
        />

        {/* Actions */}
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-400">⚠️ Modifications non sauvegardées</span>
              ) : (
                <span className="text-green-400">✓ Configuration à jour</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || saving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
              <Button
                type="submit"
                disabled={!hasChanges || saving}
              >
                {saving ? (
                  <>Enregistrement...</>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </PageShell>
  );
}

type FieldConfig = {
  name: string;
  label: string;
  value: string;
  placeholder: string;
  helper: string;
  error?: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
};

function ConfigSection({
  title,
  description,
  fields,
  children,
}: {
  title: string;
  description: string;
  fields: FieldConfig[];
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-6 bg-slate-900/40 border-slate-800">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Separator className="bg-slate-800" />
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {field.label}
              </label>
              <Input
                name={field.name}
                type={field.type || "text"}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={field.placeholder}
                className={`bg-slate-950 border-slate-800 ${
                  field.error ? "border-red-500" : ""
                }`}
              />
              {field.error && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {field.error}
                </p>
              )}
              {!field.error && field.helper && (
                <p className="text-xs text-muted-foreground">{field.helper}</p>
              )}
            </div>
          ))}
          {children}
        </div>
      </div>
    </Card>
  );
}
