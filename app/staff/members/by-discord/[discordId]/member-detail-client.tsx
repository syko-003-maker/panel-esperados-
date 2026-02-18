

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StaffPage } from "../../../ui/StaffPage";
import { StaffTable } from "../../../ui/StaffTable";
import { Badge } from "../../../ui/Badge";

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
	age: number | null;
	grade: string | null;
	gradeLevel: number;
	roleDiscordId: string | null;
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

const GRADE_COLORS: Record<string, { bg: string; color: string }> = {
	CHEF: { bg: "#f3e8ff", color: "#6b21a8" },
	CAPTAIN: { bg: "#dbeafe", color: "#1e40af" },
	OFFICER: { bg: "#e0e7ff", color: "#3730a3" },
	WL4: { bg: "#dcfce7", color: "#166534" },
	WL3: { bg: "#d1fae5", color: "#065f46" },
	WL2: { bg: "#ccfbf1", color: "#115e59" },
	WL1: { bg: "#cffafe", color: "#155e75" },
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

function statusBadge(status: string, type: "sanction" | "complaint" | "recruitment") {
	if (type === "sanction") {
		if (status === "ACTIVE") return { bg: "#fee2e2", color: "#991b1b", label: "⚠️ Active" };
		if (status === "EXPIRED") return { bg: "#fef3c7", color: "#b45309", label: "⏱️ Expirée" };
		return { bg: "#e5e7eb", color: "#374151", label: "✓ Clôturée" };
	}
	if (type === "complaint") {
		if (status === "OPEN") return { bg: "#fef3c7", color: "#b45309", label: "🔴 Ouvert" };
		if (status === "TREATED") return { bg: "#d1fae5", color: "#065f46", label: "✅ Traité" };
		if (status === "UNTREATED") return { bg: "#fee2e2", color: "#991b1b", label: "❌ Refusé" };
		return { bg: "#e5e7eb", color: "#374151", label: "⊘ Clôturé" };
	}
	if (type === "recruitment") {
		if (status === "OPEN") return { bg: "#eff6ff", color: "#0c4a6e", label: "⏳ En attente" };
		return { bg: "#ecfdf5", color: "#065f46", label: "✓ Clôturé" };
	}
	return { bg: "#f3f4f6", color: "#6b7280", label: status };
}

export function MemberDetailClient({
	member,
}: {
	member: Member;
	isChef: boolean;
}) {
	const [complaints, setComplaints] = useState<Complaint[]>([]);
	const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
	const [loading, setLoading] = useState(true);

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
			try {
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
			} finally {
				setLoading(false);
			}
		}
		loadRelatedData();
	}, [member.discordId]);

	const gradeColor = member.grade ? GRADE_COLORS[member.grade] : null;

	return (
		<StaffPage
			title={member.rpName || "Sans nom RP"}
			subtitle={`Discord: ${member.discordId}${member.steamId ? ` | Steam: ${member.steamId}` : ""}`}
		>
			<Link href="/staff/members" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
				← Retour à la liste
			</Link>

			<div className="grid gap-4 sm:grid-cols-3 mb-6">
				<div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40">
					<div className="text-xs text-muted-foreground mb-1">Âge</div>
					<div className="font-semibold text-lg text-foreground">{member.age ? `${member.age} ans` : "-"}</div>
				</div>
				<div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40">
					<div className="text-xs text-muted-foreground mb-1">Niveau de grade</div>
					<div className="font-semibold text-lg text-foreground">{member.gradeLevel}</div>
				</div>
				<div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 flex flex-col items-start gap-2">
					{gradeColor && (
						<span className="px-3 py-1 rounded text-xs font-semibold" style={{ backgroundColor: gradeColor.bg, color: gradeColor.color }}>
							{member.grade}
						</span>
					)}
				<Badge tone={member.isActive ? "green" : "gray"}>
					{member.isActive ? "✓ Actif" : "Ancien membre"}
					</Badge>
				</div>
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-bold mb-3 flex items-center gap-2">⚠️ Sanctions ({member.sanctions.length})</h2>
				{member.sanctions.length === 0 ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						Aucune sanction
					</div>
				) : (
					<StaffTable headers={["Statut", "Type", "Raison", "Créée le"]} stickyHeader>
						{member.sanctions.map((s) => {
							const badge = statusBadge(s.status, "sanction");
							return (
								<tr key={s.id} className="hover:bg-slate-900/30">
									<td className="px-4 py-3">
										<Badge tone={s.status === "ACTIVE" ? "yellow" : s.status === "EXPIRED" ? "gray" : "green"}>
											{badge.label}
										</Badge>
									</td>
									<td className="px-4 py-3 font-semibold text-sm">{s.type}</td>
									<td className="px-4 py-3 text-sm text-muted-foreground">{s.reason || "-"}</td>
									<td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(s.createdAt)}</td>
								</tr>
							);
						})}
					</StaffTable>
				)}
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-bold mb-3 flex items-center gap-2">📨 Plaintes liées ({complaints.length})</h2>
				{loading ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						⏳ Chargement...
					</div>
				) : complaints.length === 0 ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						Aucune plainte trouvée
					</div>
				) : (
					<StaffTable headers={["Statut", "Canal", "Créée le"]} stickyHeader>
						{complaints.map((c) => {
							const badge = statusBadge(c.status, "complaint");
							const tone = c.status === "OPEN" ? "yellow" : c.status === "TREATED" ? "green" : c.status === "UNTREATED" ? "red" : "gray";
							return (
								<tr key={c.id} className="hover:bg-slate-900/30">
									<td className="px-4 py-3">
										<Badge tone={tone}>{badge.label}</Badge>
									</td>
									<td className="px-4 py-3 font-mono text-sm">{c.channelId}</td>
									<td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAtDiscord)}</td>
								</tr>
							);
						})}
					</StaffTable>
				)}
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-bold mb-3 flex items-center gap-2">🧾 Recrutements liés ({recruitments.length})</h2>
				{loading ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						⏳ Chargement...
					</div>
				) : recruitments.length === 0 ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						Aucun recrutement trouvé
					</div>
				) : (
					<StaffTable headers={["Statut", "Ticket", "RP Name", "Créé le"]} stickyHeader>
						{recruitments.map((r) => {
							const badge = statusBadge(r.status, "recruitment");
							const tone = r.status === "OPEN" ? "blue" : "green";
							return (
								<tr key={r.id} className="hover:bg-slate-900/30">
									<td className="px-4 py-3">
										<Badge tone={tone}>{badge.label}</Badge>
									</td>
									<td className="px-4 py-3 font-mono text-sm">{r.ticketKey}</td>
									<td className="px-4 py-3 text-sm">{r.rpName || "-"}</td>
									<td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</td>
								</tr>
							);
						})}
					</StaffTable>
				)}
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-bold mb-3 flex items-center gap-2">📝 Notes internes staff</h2>
				{staffNotes.length === 0 ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						Aucune note interne
					</div>
				) : (
					<div className="border border-slate-800 rounded-lg divide-y divide-slate-800">
						{staffNotes.map((note) => (
							<div key={note.id} className="p-4">
								<div className="text-xs text-muted-foreground mb-1">{fmtDate(note.date)}</div>
								<div className="text-sm font-semibold text-foreground mb-2">Auteur : {note.author}</div>
								<div className="text-sm text-foreground whitespace-pre-wrap">{note.content}</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-bold mb-3 flex items-center gap-2">📊 Historique des grades ({member.gradeHistory.length})</h2>
				{member.gradeHistory.length === 0 ? (
					<div className="bg-slate-900/20 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground text-sm">
						Aucun changement de grade
					</div>
				) : (
					<StaffTable headers={["Date", "Ancien grade", "Nouveau grade", "Par", "Source"]} stickyHeader>
						{member.gradeHistory.map((h) => (
							<tr key={h.id} className="hover:bg-slate-900/30">
								<td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(h.changedAt)}</td>
								<td className="px-4 py-3 text-sm font-semibold text-muted-foreground">{h.oldGrade || "-"}</td>
								<td className="px-4 py-3 text-sm font-semibold text-primary">{h.newGrade}</td>
								<td className="px-4 py-3 text-sm text-muted-foreground">{h.changedBy || "-"}</td>
								<td className="px-4 py-3 text-sm">
									<Badge tone="gray">{h.source}</Badge>
								</td>
							</tr>
						))}
					</StaffTable>
				)}
			</div>
		</StaffPage>
	);
}
