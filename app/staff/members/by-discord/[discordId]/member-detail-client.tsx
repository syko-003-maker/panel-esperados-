

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionSection } from "@/components/staff/ui/motion";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import TrendCard from "@/components/charts/trend-card";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { getGradeBadgeProps } from "@/lib/grade-colors";
import { ASSIGNABLE_GRADES } from "@/lib/staff/grade-options";
import { getMemberDisplayName, getNeutralRankBadge, resolveStableRank } from "@/lib/member-display";
import { getSanctionLabel } from "@/lib/sanctions";
import {
	AlertTriangle,
	ArrowLeft,
	CalendarDays,
	History,
	Pencil,

	Shield,
	UserRound,
	Wifi,
	WifiOff,
	TriangleAlert,
} from "lucide-react";

type GradeHistoryEntry = {
	id: string;
	oldGrade: string | null;
	newGrade: string;
	changedAt: string;
	changedBy: string | null;
	changedByName: string | null;
	source: string;
	notes: string | null;
};

type SanctionEntry = {
	id: string;
	type: string;
	reason: string | null;
	status: string;
	createdAt: string;
};

type Member = {
	id: string;
	discordId: string;
	steamId: string | null;
	rpName: string | null;
	discordDisplayName?: string | null;
	discordUsername?: string | null;
	age: number | null;
	grade: string | null;
	gradeLevel: number;
	roleDiscordId: string | null;
	rankRoleId?: string | null;
	rankLabel?: string | null;
	discordRoleIds?: string[];
	preReservistGrade?: string | null;
	preReservistRoleId?: string | null;
	discordLastError?: string | null;
	discordSnapshotRolesJson?: unknown;
	isActive: boolean;
	joinedAt: string | null;
	createdAt: string;
	updatedAt: string;
	gradeHistory: GradeHistoryEntry[];
	sanctions: SanctionEntry[];
};

type LygPlayerInfo = {
	steamid: string;
	last_name: string;
	coins: number;
	connected: boolean;
};

type LygWarn = {
	reason: string;
	type: string;
	date: string;
	expired: boolean;
};

type AbsenceEntry = {
	id: string;
	type: "MEETING" | "GENERAL";
	meetingDate: string | null;
	reason: string | null;
	notes: string | null;
	status: string;
	uiStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "EXPIRED";
	rejectionReason: string | null;
	isActive: boolean;
	startAt: string;
	endAt: string;
	decidedAt: string | null;
	createdAt: string;
};

function fmtDate(iso: string | null) {
	if (!iso) return "-";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("fr-FR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const GRADE_SOURCE_LABELS: Record<string, string> = {
	MIGRATION: "Migration",
	MEETING:   "Réunion",
	MANUAL:    "Manuel",
	SYNC:      "Synchronisation",
};

function getGradeSourceLabel(source: string): string {
	return GRADE_SOURCE_LABELS[source] ?? source;
}

function getStatusMeta(status: string, type: "sanction" | "complaint" | "recruitment") {
	if (type === "sanction") {
		if (status === "ACTIVE") return { label: "Active", tone: "warning" as const };
		if (status === "EXPIRED") return { label: "Expirée", tone: "neutral" as const };
		return { label: "Clôturée", tone: "success" as const };
	}
	if (type === "complaint") {
		if (status === "OPEN") return { label: "Ouverte", tone: "warning" as const };
		if (status === "TREATED") return { label: "Traitée", tone: "success" as const };
		if (status === "UNTREATED") return { label: "Refusée", tone: "danger" as const };
		return { label: "Clôturée", tone: "neutral" as const };
	}
	if (type === "recruitment") {
		if (status === "OPEN") return { label: "En attente", tone: "info" as const };
		return { label: "Clôturé", tone: "success" as const };
	}
	return { label: status, tone: "neutral" as const };
}

export function MemberDetailClient({
	member,
}: {
	member: Member;
	isChef: boolean;
}) {
	const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
	const [playerInfo, setPlayerInfo] = useState<LygPlayerInfo | null>(null);
	const [warns, setWarns] = useState<LygWarn[]>([]);
	const [warnsTotal, setWarnsTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gradeTarget, setGradeTarget] = useState("");
	const [gradeSaving, setGradeSaving] = useState(false);
	const [gradeMsg, setGradeMsg] = useState<{ ok: boolean; text: string } | null>(null);

	useEffect(() => {
		async function loadRelatedData() {
			setError(null);
			try {
				const [historyRes, playerRes, warnsRes] = await Promise.allSettled([
					fetch(`/api/staff/members/by-discord/${member.discordId}/history`, { cache: "no-store" }),
					member.steamId ? fetch(`/api/staff/members/${member.id}/lyg-player`, { cache: "no-store" }) : Promise.resolve(null),
					member.steamId ? fetch(`/api/staff/members/${member.id}/lyg-warns?limit=50`, { cache: "no-store" }) : Promise.resolve(null),
				]);

				if (historyRes.status === "fulfilled" && historyRes.value?.ok) {
					const historyData = await historyRes.value.json();
					setAbsences(Array.isArray(historyData?.data?.absences) ? historyData.data.absences : []);
				}
				if (playerRes.status === "fulfilled" && playerRes.value?.ok) {
					const data = await playerRes.value.json();
					if (data?.ok) setPlayerInfo(data.data);
				}
				if (warnsRes.status === "fulfilled" && warnsRes.value) {
					const data = await warnsRes.value.json();
					if (data?.ok) {
						setWarns(data.data?.data ?? []);
						setWarnsTotal(data.data?.total ?? 0);
					}
				}
			} catch (err) {
				console.error("Failed to load related data:", err);
				setError("Certaines données liées n'ont pas pu être chargées.");
			} finally {
				setLoading(false);
			}
		}
		void loadRelatedData();
	}, [member.discordId]);

	const activeAbsence = useMemo(() => absences.find((absence) => absence.isActive) ?? null, [absences]);

	function absenceTypeLabel(type: "MEETING" | "GENERAL") {
		return type === "MEETING" ? "Absence réunion" : "Absence générale";
	}

	function absenceStatusLabel(status: AbsenceEntry["uiStatus"]) {
		if (status === "PENDING") return "En attente";
		if (status === "APPROVED") return "Approuvée";
		if (status === "REJECTED") return "Refusée";
		if (status === "EXPIRED") return "Expirée";
		return status;
	}

	const displayName = getMemberDisplayName(member);
	const stableRank = resolveStableRank({
		hasDiscordId: Boolean(member.discordId),
		rankRoleId: member.rankRoleId ?? null,
		rankLabel: member.rankLabel ?? null,
		discordRoleIds: member.discordRoleIds,
		snapshotRolesJson: member.discordSnapshotRolesJson,
		discordLastError: member.discordLastError ?? null,
	});

	const rankBadge = (() => {
		if (stableRank.rankRoleId) {
			return getGradeBadgeProps(stableRank.rankRoleId);
		}
		if (stableRank.rankLabel) {
			const base = getGradeBadgeProps(null);
			return { ...base, label: stableRank.rankLabel };
		}
		if (stableRank.neutralState) {
			return getNeutralRankBadge(stableRank.neutralState);
		}
		return null;
	})();

	const rankTone = stableRank.rankRoleId || stableRank.rankLabel ? "accent" : stableRank.neutralState ? "warning" : "neutral";

	async function onChangeGrade() {
		if (!gradeTarget || gradeSaving) return;
		const label = ASSIGNABLE_GRADES.find((g) => g.roleId === gradeTarget)?.label ?? "ce grade";
		if (!window.confirm(`Changer le grade de ${displayName} → ${label} ?\nLe rôle Discord sera mis à jour par le bot.`)) return;
		setGradeSaving(true);
		setGradeMsg(null);
		try {
			const res = await fetch("/api/staff/members/set-grade", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ memberId: member.id, targetRoleId: gradeTarget }),
			});
			const json = await res.json();
			if (!res.ok || !json?.ok) {
				setGradeMsg({ ok: false, text: json?.message || json?.error || "Échec du changement de grade." });
			} else {
				setGradeMsg({
					ok: true,
					text: `✅ ${json.oldGrade ?? "?"} → ${json.newGrade}. Le rôle Discord se met à jour dans quelques secondes.`,
				});
				setGradeTarget("");
			}
		} catch (e: any) {
			setGradeMsg({ ok: false, text: e?.message || "Erreur réseau." });
		} finally {
			setGradeSaving(false);
		}
	}

	return (
		<PageShell
			title={displayName}
			description={`Discord: ${member.discordId}${member.steamId ? ` • Steam: ${member.steamId}` : ""}`}
			icon={UserRound}
			actions={
				<>
					<MotionButtonFrame>
						<Link
							href="/staff/members"
							className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
						>
							<ArrowLeft className="h-4 w-4" />
							Retour à la liste
						</Link>
					</MotionButtonFrame>
					<MotionButtonFrame>
						<Link
							href={`/staff/members/by-id/${member.id}`}
							className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
						>
							<Pencil className="h-4 w-4" />
							Éditer la fiche
						</Link>
					</MotionButtonFrame>
					{rankBadge ? <StatusBadge tone={rankTone}>{rankBadge.label}</StatusBadge> : null}
					<StatusBadge tone={member.isActive ? "success" : "neutral"}>
						{member.isActive ? "Membre actif" : "Ancien membre"}
					</StatusBadge>
				</>
			}
		>
			<MotionSection delay={0.03}>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<DataTile label="Âge" value={member.age ? `${member.age} ans` : "Non renseigné"} />
					<DataTile label="Niveau de grade" value={member.gradeLevel} tone="info" />
					<DataTile
						label="Rang stable"
						value={rankBadge ? <StatusBadge tone={rankTone}>{rankBadge.label}</StatusBadge> : "Sans grade détecté"}
						tone={rankBadge ? "info" : "default"}
					/>
					<DataTile
						label="Dernière mise à jour"
						value={fmtDate(member.updatedAt)}
						tone={member.isActive ? "success" : "warning"}
					/>
				</div>
			</MotionSection>

			{member.steamId ? (
				<MotionSection delay={0.05}>
					<div className="grid gap-3 md:grid-cols-3">
						<DataTile
							label="Sur le serveur"
							value={
								playerInfo === null
									? "Chargement..."
									: playerInfo.connected
										? <span className="flex items-center gap-2 text-emerald-400"><Wifi className="h-4 w-4" /> Connecté</span>
										: <span className="flex items-center gap-2 text-slate-400"><WifiOff className="h-4 w-4" /> Hors ligne</span>
							}
							tone={playerInfo?.connected ? "success" : "default"}
						/>
						<DataTile
							label="Dernier nom RP (jeu)"
							value={playerInfo?.last_name ?? "—"}
						/>
						<DataTile
							label="Coins"
							value={playerInfo ? `${playerInfo.coins.toLocaleString("fr-FR")} 💰` : "—"}
							tone="info"
						/>
					</div>
				</MotionSection>
			) : null}

			<MotionSection delay={0.045}>
				<SectionCard
					title="Changer le grade"
					description="Promouvoir ou rétrograder ce membre (hors réunion). Le rôle de grade Discord est appliqué par le bot."
					icon={UserRound}
				>
					{/* Rôle Réserviste (1312845999366209682) encore présent → on propose de restaurer son ancien rang */}
					{(member.discordRoleIds ?? []).includes("1312845999366209682") && member.preReservistGrade && (
						<div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
							<span>
								⭐ Dernier rang avant réserviste : <strong className="text-amber-50">{member.preReservistGrade}</strong>
							</span>
							{member.preReservistRoleId && (
								<button
									type="button"
									onClick={() => setGradeTarget(member.preReservistRoleId!)}
									className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/25"
								>
									Restaurer ce rang
								</button>
							)}
						</div>
					)}
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex min-w-[200px] flex-1 flex-col gap-1">
							<label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Nouveau grade</label>
							<select
								value={gradeTarget}
								onChange={(e) => setGradeTarget(e.target.value)}
								disabled={gradeSaving}
								className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-amber-500/40 focus:outline-none"
							>
								<option value="" className="bg-slate-950">— choisir un grade —</option>
								{ASSIGNABLE_GRADES.map((g) => (
									<option key={g.roleId} value={g.roleId} className="bg-slate-950 text-slate-100">
										{g.label}
									</option>
								))}
							</select>
						</div>
						<button
							type="button"
							onClick={onChangeGrade}
							disabled={!gradeTarget || gradeSaving}
							className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{gradeSaving ? "Application…" : "Appliquer"}
						</button>
					</div>
					<p className="mt-2 text-xs text-slate-500">
						Grade actuel : <span className="font-semibold text-slate-300">{member.grade ?? stableRank.rankLabel ?? "—"}</span>. Chef famille exclu.
					</p>
					{gradeMsg && (
						<p className={`mt-2 text-sm ${gradeMsg.ok ? "text-emerald-300" : "text-red-300"}`}>{gradeMsg.text}</p>
					)}
				</SectionCard>
			</MotionSection>

			<MotionSection delay={0.06}>
				<TrendCard
					endpoint={`/api/staff/series?memberId=${member.id}`}
					title="Évolution (argent & playtime)"
					defaultMetric="money"
				/>
			</MotionSection>

			{error ? (
				<SectionCard
					title="Chargement partiel"
					description="La fiche principale reste disponible, mais certaines données liées n'ont pas pu être récupérées."
					icon={AlertTriangle}
				>
					<div className="flex flex-wrap items-center gap-2 text-sm text-amber-100">
						<StatusBadge tone="warning">Données liées incomplètes</StatusBadge>
						<span>{error}</span>
					</div>
				</SectionCard>
			) : null}

			<SectionCard
				title={`Absences (${absences.length})`}
				description="Historique des absences et état courant du membre sur les réunions et indisponibilités."
				icon={CalendarDays}
			>
				{loading ? (
					<LoadingState title="Chargement des absences" description="Récupération de l'historique d'absence du membre." />
				) : absences.length === 0 ? (
					<EmptyState title="Aucune absence" description="Aucune absence n'est enregistrée pour ce membre." />
				) : (
					<div className="space-y-4">
						{activeAbsence ? (
							<div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
								<span className="font-semibold">Absence active:</span>{" "}
								{absenceTypeLabel(activeAbsence.type)} jusqu'au {fmtDate(activeAbsence.endAt)}
							</div>
						) : null}
						<SurfaceTable headers={["Type", "Statut", "Période", "Motif"]}>
							{absences.map((absence) => (
								<tr key={absence.id} className="border-t border-white/8">
									<td className="px-4 py-3 text-sm font-semibold text-slate-100">{absenceTypeLabel(absence.type)}</td>
									<td className="px-4 py-3 text-sm">
										<StatusBadge tone={absence.uiStatus === "APPROVED" ? "success" : absence.uiStatus === "REJECTED" ? "danger" : absence.uiStatus === "PENDING" ? "warning" : "neutral"}>
											{absenceStatusLabel(absence.uiStatus)}
										</StatusBadge>
									</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">
										{fmtDate(absence.startAt)} → {fmtDate(absence.endAt)}
									</td>
									<td className="px-4 py-3 text-sm text-slate-400">
										{absence.reason || "-"}
										{absence.rejectionReason ? ` (Refus: ${absence.rejectionReason})` : ""}
									</td>
								</tr>
							))}
						</SurfaceTable>
					</div>
				)}
			</SectionCard>

			{member.steamId ? (
				<SectionCard
					title={`Warns in-game (${warnsTotal})`}
					description="Avertissements reçus en jeu sur le serveur Garry's Mod, récupérés depuis l'API LYG."
					icon={TriangleAlert}
				>
					{loading ? (
						<LoadingState title="Chargement des warns" description="Récupération des warns depuis l'API LYG." />
					) : warns.length === 0 ? (
						<EmptyState title="Aucun warn" description="Ce membre n'a reçu aucun avertissement en jeu." />
					) : (
						<SurfaceTable headers={["Statut", "Type", "Raison", "Date"]}>
							{warns.map((warn, i) => (
								<tr key={i} className="border-t border-white/8">
									<td className="px-4 py-3">
										<StatusBadge tone={warn.expired ? "neutral" : "warning"}>
											{warn.expired ? "Expiré" : "Actif"}
										</StatusBadge>
									</td>
									<td className="px-4 py-3 text-sm font-semibold text-slate-100">{getSanctionLabel(warn.type)}</td>
									<td className="px-4 py-3 text-sm text-slate-400">{warn.reason}</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(warn.date)}</td>
								</tr>
							))}
						</SurfaceTable>
					)}
				</SectionCard>
			) : null}

			<SectionCard
				title={`Sanctions (${member.sanctions.length})`}
				description="Vue rapide des sanctions appliquées au membre et de leur état courant."
				icon={Shield}
			>
				{member.sanctions.length === 0 ? (
					<EmptyState title="Aucune sanction" description="Aucune sanction n'est rattachée à cette fiche membre." />
				) : (
					<SurfaceTable headers={["Statut", "Type", "Raison", "Date de création"]}>
						{member.sanctions.map((sanction) => {
							const meta = getStatusMeta(sanction.status, "sanction");
							return (
								<tr key={sanction.id} className="border-t border-white/8">
									<td className="px-4 py-3">
										<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
									</td>
									<td className="px-4 py-3 text-sm font-semibold text-slate-100">{getSanctionLabel(sanction.type)}</td>
									<td className="px-4 py-3 text-sm text-slate-400">{sanction.reason || "-"}</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(sanction.createdAt)}</td>
								</tr>
							);
						})}
					</SurfaceTable>
				)}
			</SectionCard>

			<SectionCard
				title={`Historique des grades (${member.gradeHistory.length})`}
				description="Historique récent des évolutions de grade, de leur origine et de l'auteur du changement."
				icon={History}
			>
				{member.gradeHistory.length === 0 ? (
					<EmptyState title="Aucun changement de grade" description="Aucune évolution de grade n'est enregistrée pour ce membre." />
				) : (
					<SurfaceTable headers={["Date", "Ancien grade", "Nouveau grade", "Par", "Source"]}>
						{member.gradeHistory.map((historyEntry) => (
							<tr key={historyEntry.id} className="border-t border-white/8">
								<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(historyEntry.changedAt)}</td>
								<td className="px-4 py-3 text-sm font-semibold text-slate-400">{historyEntry.oldGrade || "-"}</td>
								<td className="px-4 py-3 text-sm font-semibold text-slate-100">{historyEntry.newGrade}</td>
								<td className="px-4 py-3 text-sm text-slate-400">{historyEntry.changedByName || historyEntry.changedBy || "-"}</td>
								<td className="px-4 py-3 text-sm">
									<StatusBadge>{getGradeSourceLabel(historyEntry.source)}</StatusBadge>
								</td>
							</tr>
						))}
					</SurfaceTable>
				)}
			</SectionCard>
		</PageShell>
	);
}

function SurfaceTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
	return (
		<div className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03]">
			<table className="min-w-full border-collapse text-sm">
				<thead>
					<tr className="bg-white/[0.03] text-left">
						{headers.map((header) => (
							<th key={header} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>{children}</tbody>
			</table>
		</div>
	);
}
