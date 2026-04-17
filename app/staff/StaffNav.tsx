"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const NEW_BADGE_KEY = "esperados_stats_new_badge_first_seen_v1";
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

interface StaffNavProps {
  isAdmin?: boolean;
  isChef?: boolean;
  isRecruiter?: boolean;
  isStaffFull?: boolean;
}

export default function StaffNav({
  isAdmin = false,
  isChef = false,
  isRecruiter = false,
  isStaffFull = false,
}: StaffNavProps) {
  const pathname = usePathname();
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    try {
      const now = Date.now();
      const raw = localStorage.getItem(NEW_BADGE_KEY);

      if (!raw) {
        localStorage.setItem(NEW_BADGE_KEY, String(now));
        setShowNew(true);
        return;
      }

      const firstSeen = Number(raw);
      if (!Number.isFinite(firstSeen)) {
        localStorage.setItem(NEW_BADGE_KEY, String(now));
        setShowNew(true);
        return;
      }

      setShowNew(now - firstSeen < TWO_DAYS_MS);
    } catch {
      setShowNew(false);
    }
  }, []);

  function linkStyle(href: string) {
    const isActive = pathname === href || (pathname?.startsWith(href + "/") ?? false);

    return {
      textDecoration: "none",
      fontWeight: isActive ? 800 : 400,
      color: isActive ? "#12b76a" : "inherit",
      borderBottom: isActive ? "2px solid #12b76a" : "2px solid transparent",
      paddingBottom: 2,
    } as CSSProperties;
  }

  // STAFF_FULL role can access all staff features
  if (isStaffFull) {
    return (
      <>
        <Link href="/staff/dashboard" style={linkStyle("/staff/dashboard")}>
          Dashboard
        </Link>

        <Link href="/staff/banklogs" style={linkStyle("/staff/banklogs")}>
          Banque
        </Link>

        {isAdmin ? (
          <Link
            href="/staff/stats"
            style={{
              ...linkStyle("/staff/stats"),
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Banque Famille
            {showNew && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "#12b76a",
                  color: "white",
                  lineHeight: 1,
                }}
              >
                Nouveau
              </span>
            )}
          </Link>
        ) : null}

        <Link href="/staff/members" style={linkStyle("/staff/members")}>
          Membres
        </Link>

        <Link href="/staff/recruitment" style={linkStyle("/staff/recruitment")}>
          Recrutement
        </Link>

        <Link href="/staff/complaints" style={linkStyle("/staff/complaints")}>
          Plaintes
        </Link>

        <Link href="/staff/meetings" style={linkStyle("/staff/meetings")}>
          Réunions
        </Link>

        <Link href="/staff/activity" style={linkStyle("/staff/activity")}>
          Activité
        </Link>

        <Link href="/staff/absences" style={linkStyle("/staff/absences")}>
          Absences
        </Link>

        <Link href="/staff/sanctions" style={linkStyle("/staff/sanctions")}>
          Sanctions
        </Link>

        <Link href="/staff/discord" style={linkStyle("/staff/discord")}>
          Settings
        </Link>

        {isChef ? (
          <Link href="/staff/discord" style={linkStyle("/staff/discord")}>
            Discord
          </Link>
        ) : null}

      </>
    );
  }

  // RECRUITER role can only access recruitment
  if (isRecruiter) {
    return (
      <>
        <Link href="/staff/recruitment" style={linkStyle("/staff/recruitment")}>
          Recrutement
        </Link>
      </>
    );
  }

  // Fallback: show nothing if no role
  return null;
}

