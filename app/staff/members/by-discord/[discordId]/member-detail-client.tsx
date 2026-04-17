

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionSection } from "@/components/staff/ui/motion";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { getGradeBadgeProps } from "@/lib/grade-colors";
import { getMemberDisplayName, getNeutralRankBadge, resolveStableRank } from "@/lib/member-display";
import {
	AlertTriangle,
	ArrowLeft,
	CalendarDays,
	ClipboardList,
	History,
	MessageSquareText,
	NotebookPen,
	Shield,
	UserRound,
} from "lucide-react";

type GradeHistoryEntry = {
	id: string;
	oldGrade: string | null;
	newGrade: string;
	changedAt: string;
	changedBy: string | null;
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
	discordLastError?: string | null;
	discordSnapshotRolesJson?: unknown;
	isActive: boolean;
	joinedAt: string | null;
	createdAt: string;
	updatedAt: string;
	gradeHistory: GradeHistoryEntry[];
	sanctions: SanctionEntry[];
};

type Complaint = {
	id: string;
	channelId: string;
	status: string;
	createdAtDiscord: string;
};

type Recruitment = {
	id: string;
	ticketKey: string;
	status: string;
	rpName: string | null;
	createdAt: string;
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
	const [complaints, setComplaints] = useState<Complaint[]>([]);
	const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
	const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const staffNotes = useMemo(() => {
		return member.gradeHistory
			.filter((h) => Boolean(h.notes?.trim()))
			.map((h) => ({
				id: h.id,
				date: h.changedAt,
				author: h.changedBy ?? member.discordId,
				content: h.notes?.trim() ?? "",
			}));
	}, [member.gradeHistory, member.discordId]);

	useEffect(() => {
		async function loadRelatedData() {
			setError(null);
			try {
				const historyRes = await fetch(`/api/staff/members/by-discord/${member.discordId}/history`, { cache: "no-store" });
				if (historyRes.ok) {
					const historyData = await historyRes.json();
					setAbsences(Array.isArray(historyData?.data?.absences) ? historyData.data.absences : []);
				}

				const complaintsRes = await fetch("/api/staff/complaints", { cache: "no-store" });
				if (complaintsRes.ok) {
					const data = await complaintsRes.json();
					setComplaints((data?.data || []).slice(0, 10));
				}
				const recruitmentsRes = await fetch(`/api/staff/list/recruitments?q=${member.discordId}`, { cache: "no-store" });
				if (recruitmentsRes.ok) {
					const data = await recruitmentsRes.json();
					setRecruitments(data?.data || []);
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
	const complaintsPreview = complaints.slice(0, 10);

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
									<td className="px-4 py-3 text-sm font-semibold text-slate-100">{sanction.type}</td>
									<td className="px-4 py-3 text-sm text-slate-400">{sanction.reason || "-"}</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(sanction.createdAt)}</td>
								</tr>
							);
						})}
					</SurfaceTable>
				)}
			</SectionCard>

			<SectionCard
				title={`Plaintes liées (${complaintsPreview.length})`}
				description="Dernières plaintes visibles depuis le panel staff pour ce membre."
				icon={MessageSquareText}
			>
				{loading ? (
					<LoadingState title="Chargement des plaintes" description="Récupération des plaintes liées au membre." />
				) : complaintsPreview.length === 0 ? (
					<EmptyState title="Aucune plainte trouvée" description="Aucune plainte exploitable n'a été trouvée pour ce membre." />
				) : (
					<SurfaceTable headers={["Statut", "Canal", "Date de création"]}>
						{complaintsPreview.map((complaint) => {
							const meta = getStatusMeta(complaint.status, "complaint");
							return (
								<tr key={complaint.id} className="border-t border-white/8">
									<td className="px-4 py-3">
										<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
									</td>
									<td className="px-4 py-3 font-mono text-sm text-slate-300">{complaint.channelId}</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(complaint.createdAtDiscord)}</td>
								</tr>
							);
						})}
					</SurfaceTable>
				)}
			</SectionCard>

			<SectionCard
				title={`Recrutements liés (${recruitments.length})`}
				description="Suivi rapide des recrutements associés au Discord de ce membre."
				icon={ClipboardList}
			>
				{loading ? (
					<LoadingState title="Chargement des recrutements" description="Récupération des recrutements liés au membre." />
				) : recruitments.length === 0 ? (
					<EmptyState title="Aucun recrutement trouvé" description="Aucun recrutement lié n'a été identifié pour ce membre." />
				) : (
					<SurfaceTable headers={["Statut", "Ticket", "Nom RP", "Date de création"]}>
						{recruitments.map((recruitment) => {
							const meta = getStatusMeta(recruitment.status, "recruitment");
							return (
								<tr key={recruitment.id} className="border-t border-white/8">
									<td className="px-4 py-3">
										<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
									</td>
									<td className="px-4 py-3 font-mono text-sm text-slate-300">{recruitment.ticketKey}</td>
									<td className="px-4 py-3 text-sm text-slate-100">{recruitment.rpName || "-"}</td>
									<td className="px-4 py-3 text-sm whitespace-nowrap text-slate-400">{fmtDate(recruitment.createdAt)}</td>
								</tr>
							);
						})}
					</SurfaceTable>
				)}
			</SectionCard>

			<SectionCard
				title="Notes internes staff"
				description="Notes métier historisées depuis les changements de grade et annotations internes."
				icon={NotebookPen}
			>
				{staffNotes.length === 0 ? (
					<EmptyState title="Aucune note interne" description="Aucune note staff n'est disponible pour cette fiche membre." />
				) : (
					<div className="space-y-3">
						{staffNotes.map((note, index) => (
							<MotionSection key={note.id} delay={0.02 + index * 0.01}>
								<div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
									<div className="text-xs text-slate-500">{fmtDate(note.date)}</div>
									<div className="mt-2 text-sm font-semibold text-slate-100">Auteur : {note.author}</div>
									<div className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{note.content}</div>
								</div>
							</MotionSection>
						))}
					</div>
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
								<td className="px-4 py-3 text-sm text-slate-400">{historyEntry.changedBy || "-"}</td>
								<td className="px-4 py-3 text-sm">
									<StatusBadge>{historyEntry.source}</StatusBadge>
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
