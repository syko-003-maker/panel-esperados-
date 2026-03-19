/**
 * /api/staff/sync/all - Robust full data synchronization
 * 
 * Syncs data from LYG with graceful degradation:
 * - Members (REQUIRED) - GET /familles/{familyId}/members
 * - Infos (OPTIONAL) - probes multiple endpoints with fallback
 * - Banklogs (OPTIONAL) - tries multiple endpoints with fallback
 * 
 * Returns detailed status with warnings. 
 * ok=true if members succeed, even if infos/banklogs fail.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePrivileged } from "@/lib/guards";
import { debug, error as logError } from "@/lib/logger";
import { lygFetchJson, lygFetchMembers, extractArrayFromLygResponse, normalizeLygMember } from "@/lib/lyg-client";
import { lygProbeInfos } from "@/lib/lyg-probe-infos";
import { fetchLygBanklogs } from "@/lib/lyg-banklogs";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { normalizeSteamId64 } from "@/lib/validation/steamid";
import { resolveRankFromDiscord } from "@/lib/discord-rank";
import { checkBatchDiscordActivity } from "@/lib/discord-member-activity";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-lock";
import { syncMemberPlaytime7d } from "@/lib/sync/syncMemberPlaytime7d";

interface SyncResult {
  ok: boolean;
  elapsedMs?: number;
  members: {
    ok: boolean;
    fetched?: number;
    upserted?: number;
    updated?: number;
    skipped?: number;
    status?: number;
    error?: string;
    bodySnippet?: string;
    duration?: number;
    reason?: string;
    meta?: {
      urlUsed?: string;
      extractedCount?: number;
      skippedInvalid?: number;
      contentType?: string | null;
    };
  };
  infos: {
    ok: boolean;
    status?: number;
    error?: string;
    bodySnippet?: string;
    duration?: number;
  };
  banklogs?: {
    ok: boolean;
    inserted?: number;
    updated?: number;
    skipped?: number;
    status?: number;
    error?: string;
    bodySnippet?: string;
    duration?: number;
    resolvedEndpoint?: string;
  };
  playtimeResult?: {
    ok: boolean;
    fetched?: number;
    scanned?: number;
    updated?: number;
    resetToZero?: number;
    skippedWithoutSteamId?: number;
    unchanged?: number;
    missingFromSnapshot?: number;
    error?: string;
  };
  warnings?: Array<{ type: string; error: string; hint?: string }>;
  message: string;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let lockKey = "";
  let lockAcquired = false;
  
  try {
    // ✅ Check authorization
    const guard = await requirePrivileged();
    if (guard instanceof Response) {
      debug("[sync/all] Authorization failed");
      return guard;
    }


    const session = (guard as any).session;
    const lygToken = process.env.LYG_TOKEN?.trim();
    if (!lygToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing LYG token",
          members: { ok: false },
          infos: { ok: false },
          message: "LYG_TOKEN is not configured",
        },
        { status: 500 }
      );
    }
    
    // ✅ Get session Discord ID for active user override
    const sessionDiscordId = await getUserDiscordIdFromSession(session);
    debug("[sync/all] Session Discord ID resolved", {
      sessionDiscordId: sessionDiscordId ? sessionDiscordId.substring(0, 6) + "..." : null,
    });
    
    // CRITICAL: ALWAYS use DEFAULT_FAMILY_ID (slug-only), never session.familyId if it's a display name
    const familySlug = DEFAULT_FAMILY_ID;
    
    // Warn if session has a different familyId (possible cached display name)
    if ((session as any)?.familyId && (session as any).familyId !== DEFAULT_FAMILY_ID) {
      console.warn("[sync/all] Session has non-slug familyId (ignoring)", {
        sessionFamilyId: (session as any).familyId,
        enforced: DEFAULT_FAMILY_ID,
      });
    }
    
    debug("[sync/all] Authorization passed", {
      discordId: session?.discordId,
      isOwner: session?._auth?.isOwner,
      hasChefRole: session?._auth?.hasChefRole,
      enforced: `familySlug=${familySlug}`,
    });

    // ✅ SYNC LOCK: Prevent concurrent syncs for same family
    lockKey = `sync:all:${familySlug}`;
    const lock = acquireSyncLock(lockKey, 60000); // 60s TTL

    if (lock.locked) {
      debug("[sync/all] Sync already in progress", {
        familySlug,
        remainingMs: lock.remainingMs,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "SYNC_ALREADY_RUNNING",
          message: "Une synchronisation est déjà en cours",
          remainingMs: lock.remainingMs,
        },
        { status: 409 }
      );
    }
    lockAcquired = true;

    // Initialize result BEFORE try block so catch can access it
    const result: SyncResult = {
      ok: false,
      members: { ok: false },
      infos: { ok: false },
      warnings: [],
      message: "",
    };

    debug("[sync/all] Starting sync for family:", familySlug);

    // 1️⃣ MEMBERS (REQUIRED)
    debug("[sync/all] Fetching members from LYG...");
    const membersResponse = await lygFetchMembers(familySlug, { timeoutMs: 60_000 });

    if (!membersResponse.ok || !membersResponse.data) {
      logError("[sync/all] Members sync FAILED:", membersResponse.error);
      result.members = {
        ok: false,
        fetched: 0,
        upserted: 0,
        status: membersResponse.status,
        error: membersResponse.error,
        bodySnippet: membersResponse.text?.slice(0, 800),
        duration: membersResponse.duration,
        reason: "fetch_failed",
        meta: membersResponse.meta,
      };
      result.message = "Failed to sync members - database not updated.";
      const elapsedMs = Date.now() - startTime;
      logError("[sync/all] Sync FAILED after", elapsedMs, "ms");
      return NextResponse.json({ ...result, elapsedMs }, { status: 500 });
    }

    // membersResponse.data is already validated and filtered by lygFetchMembers
    const extractedMembers = membersResponse.data || [];

    debug("[sync/all] Fetched validated members from LYG", {
      count: extractedMembers.length,
      meta: membersResponse.meta,
    });

    // Import members into DB
    let upsertCount = 0;
    let updateCount = 0;
    let skipCount = 0;

    if (extractedMembers.length === 0) {
      debug("[sync/all] No members extracted from LYG response");
      result.members = {
        ok: true,
        fetched: membersResponse.meta?.extractedCount || 0,
        upserted: 0,
        updated: 0,
        skipped: membersResponse.meta?.skippedInvalid || 0,
        status: membersResponse.status,
        duration: membersResponse.duration,
        reason: "no_data_received",
        meta: membersResponse.meta,
      };
      // ✅ FIXED: Only warn if extraction truly failed, not if LYG just has no new members
      // If skippedInvalid > 0, it means data was found but invalid - that's worth warning
      if ((membersResponse.meta?.skippedInvalid || 0) > 0) {
        if (!result.warnings) result.warnings = [];
        result.warnings.push({
          type: "members_invalid",
          error: "Some members from LYG had invalid data",
          hint: `${membersResponse.meta?.skippedInvalid} member(s) were rejected (missing/invalid steamId). Database was not updated for these.`,
        });
      }
      // If skippedInvalid === 0, it's just "no new data available" - NOT an error
    } else {
      try {
        // ✅ CRITICAL: Ensure Family exists before inserting members
        // Family.id is a cuid, Family.slug stores the external ID ("esperados")
        const familyDbId = await resolveFamilyId(familySlug);

        debug("[sync/all] Family resolved", {
          slug: familySlug,
          id: familyDbId,
        });

        // Normalize and filter members (already done by lygFetchMembers, but keep safety)
        const normalizedMembers = extractedMembers
          .map((item: any) => {
            const normalized = normalizeLygMember(item, "esperados");
            return normalized;
          })
          .filter(member => member !== null);

        debug("[sync/all] Normalized members", {
          before: extractedMembers.length,
          after: normalizedMembers.length,
        });

        const syncNow = new Date();

        // Upsert each member
        for (const normalized of normalizedMembers) {
          if (!normalized || !normalized.steamId64) {
            skipCount++;
            continue;
          }

          // ✅ VALIDATION: Vérifier que le SteamID64 est valide
          const validatedSteamId = normalizeSteamId64(normalized.steamId64);
          if (!validatedSteamId && normalized.steamId64) {
            debug("[sync/all] Invalid SteamID64 detected, skipping:", normalized.steamId64);
            skipCount++;
            continue;
          }

          // ✅ CHECK: Is this the logged-in user?
          const isSessionUser = normalized.discordId && sessionDiscordId && normalized.discordId === sessionDiscordId;

          const memberData = {
            rpName: normalized.rpName || undefined,
            grade: normalized.grade || null,
            joinedAt: normalized.joinedAt ? new Date(normalized.joinedAt) : null,
            isActive: true,  // ✅ FORCED TRUE: Member is in LYG response
            steamId: validatedSteamId || undefined,
            discordId: normalized.discordId || undefined,
            source: "LYG" as const, // ✅ Provenance: LYG API sync
            lastSeenAt: syncNow,
            missingSince: null,
            missingFromLygSince: null,
          };
          
          // ✅ OVERRIDE: Session user can NOT be marked as ancien
          // If this member is the logged-in user, ALWAYS ensure isActive=true + log override
          if (isSessionUser) {
            console.log("[ACTIVE_OVERRIDE]", {
              reason: "SESSION_USER",
              rpName: normalized.rpName || "Unknown",
              discordId: normalized.discordId,
              steamId: validatedSteamId,
              forcedActive: true,
              foundInLyg: true,
            });
          }

          let existingMember = null;

          // Try to find existing member by unique constraint
          if (validatedSteamId) {
            existingMember = await prisma.member.findUnique({
              where: { familyId_steamId: { familyId: familyDbId, steamId: validatedSteamId } },
            });
          } else if (normalized.discordId) {
            existingMember = await prisma.member.findUnique({
              where: { familyId_discordId: { familyId: familyDbId, discordId: normalized.discordId } },
            });
          } else if (normalized.rpName) {
            // If no steamId/discordId, find by rpName
            existingMember = await prisma.member.findFirst({
              where: { familyId: familyDbId, rpName: normalized.rpName },
            });
          }

          if (existingMember) {
            // Update existing member (don't override source)
            const { source, ...dataWithoutSource } = memberData;
            
            // ✅ PRESERVE EXISTING DISCORD ID: Never overwrite with null/undefined
            // Only update discordId if a NEW valid discordId is provided
            const updateData: any = { ...dataWithoutSource };
            
            if (!updateData.discordId && existingMember.discordId) {
              // Preserve existing discordId - don't nullify it
              delete updateData.discordId;
              console.log("[sync/all] Preserving existing discordId", {
                memberId: existingMember.id,
                rpName: normalized.rpName,
                existingDiscordId: existingMember.discordId.substring(0, 8) + "...",
                lygHadDiscordId: !!normalized.discordId,
              });
            }
            
            // ✅ PRESERVE EXISTING STEAM ID: Never overwrite with null/undefined
            // Only update steamId if a NEW valid steamId is provided
            if (!updateData.steamId && existingMember.steamId) {
              // Preserve existing steamId - don't nullify it
              delete updateData.steamId;
              console.log("[sync/all] Preserving existing steamId", {
                memberId: existingMember.id,
                rpName: normalized.rpName,
                existingSteamId: existingMember.steamId.substring(0, 12) + "...",
                lygHadSteamId: !!validatedSteamId,
              });
            }
            
            // ✅ PRESERVE EXISTING RP NAME: Never overwrite with null/undefined
            // Only update rpName if a NEW valid rpName is provided
            if (!updateData.rpName && existingMember.rpName) {
              // Preserve existing rpName - don't nullify it
              delete updateData.rpName;
              console.log("[sync/all] Preserving existing rpName", {
                memberId: existingMember.id,
                existingRpName: existingMember.rpName,
                lygHadRpName: !!normalized.rpName,
                steamId: existingMember.steamId?.substring(0, 12) + "...",
              });
            }
            
            await prisma.member.update({
              where: { id: existingMember.id },
              data: updateData,
            });
            updateCount++;

            // Resolve rank if discordId available
            if (memberData.discordId) {
              try {
                const rankInfo = await resolveRankFromDiscord(memberData.discordId);
                if (rankInfo.rankRoleId !== null || rankInfo.rankLabel !== null) {
                  await prisma.member.update({
                    where: { id: existingMember.id },
                    data: {
                      rankRoleId: rankInfo.rankRoleId,
                      rankLabel: rankInfo.rankLabel,
                    },
                  });
                }
              } catch (err) {
                debug("[sync/all] Rank resolution failed for member", {
                  memberId: existingMember.id,
                  discordId: memberData.discordId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          } else {
            // Create new member
            const createdMember = await prisma.member.create({
              data: {
                familyId: familyDbId,
                ...memberData,
              },
              select: { id: true },
            });
            upsertCount++;

            // Resolve rank if discordId available
            if (memberData.discordId) {
              try {
                const rankInfo = await resolveRankFromDiscord(memberData.discordId);
                if (rankInfo.rankRoleId !== null || rankInfo.rankLabel !== null) {
                  await prisma.member.update({
                    where: { id: createdMember.id },
                    data: {
                      rankRoleId: rankInfo.rankRoleId,
                      rankLabel: rankInfo.rankLabel,
                    },
                  });
                }
              } catch (err) {
                debug("[sync/all] Rank resolution failed for new member", {
                  memberId: createdMember.id,
                  discordId: memberData.discordId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }
        }

        debug("[sync/all] Members imported to DB", {
          extracted: extractedMembers.length,
          normalized: normalizedMembers.length,
          upserted: upsertCount,
          updated: updateCount,
          skipped: skipCount,
        });

        // ✅ RECONCILIATION: Sync isActive state with LYG reality
        // After upsert, ensure ONLY members present in LYG are active
        // This prevents accumulating inactive members over time
        
        const activeSteamIds = normalizedMembers
          .map((m) => String(m.steamId64 ?? "").trim())
          .filter((id) => id.length > 0)
          .filter((id, index, arr) => arr.indexOf(id) === index); // unique

        const lygSet = new Set(activeSteamIds);
        const activeSteamIdsCount = activeSteamIds.length;

        console.log("[members] active stats", {
          total: normalizedMembers.length,
          actifs: activeSteamIds.length,
          anciens: normalizedMembers.length - activeSteamIds.length,
          lygSetSample: Array.from(lygSet).slice(0, 3),
        });

        debug("[sync/all] Reconciling active state with LYG", {
          familyId: familyDbId,
          normalizedMembersCount: normalizedMembers.length,
          lygSteamIdsCount: activeSteamIds.length,
          lygActivesCount: activeSteamIdsCount,
          hasValidSteamIds: activeSteamIds.length > 0,
        });

        // Get current state before reconciliation
        const countBeforeReconcile = await prisma.member.count({
          where: {
            familyId: familyDbId,
            isActive: true,
          },
        });

        debug("[sync/all] Members active before reconciliation", {
          familyId: familyDbId,
          activeCount: countBeforeReconcile,
        });

        // ✅ PARTIAL SYNC GUARD: If LYG returns < 70% of DB members, treat as partial
        // Don't deactivate all to avoid false "old members" marking
        const isPartialSync = activeSteamIds.length > 0 && 
          activeSteamIds.length < (countBeforeReconcile * 0.7);

        if (isPartialSync) {
          console.warn("[sync/members] PARTIAL_SYNC_GUARD", {
            lygMembersCount: activeSteamIds.length,
            dbMembersCount: countBeforeReconcile,
            threshold: Math.round(countBeforeReconcile * 0.7),
            action: "SKIPPING_DEACTIVATE_ALL",
          });
          debug("[sync/all] Partial sync detected - skipping deactivate-all", {
            lygCount: activeSteamIds.length,
            dbCount: countBeforeReconcile,
          });
        }

        const membersForCheck = await prisma.member.findMany({
          where: {
            familyId: familyDbId,
            steamId: { not: null },
          },
          select: {
            id: true,
            steamId: true,
            rpName: true,
            grade: true,
            rankLabel: true,
            isActive: true,
            missingFromLygSince: true,
          },
        });

        let validSteamIds = 0;
        let invalidSteamIds = 0;

        for (const member of membersForCheck) {
          const steamId = String(member.steamId ?? "").trim();
          const isValidFormat = /^\d{17}$/.test(steamId);
          
          if (!isValidFormat) {
            invalidSteamIds++;
          } else {
            validSteamIds++;
          }
        }

        const debugLyg = process.env.DEBUG_LYG_SYNC === "1";
        const graceDaysRaw = Number(process.env.LYG_MISSING_GRACE_DAYS ?? "14");
        const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw > 0 ? graceDaysRaw : 14;
        const graceCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

        // Use transaction for atomicity
        const reconcileResult = await prisma.$transaction(async (tx) => {
          if (activeSteamIds.length === 0) {
            debug("[sync/all] No valid steamIds from LYG, skipping reconciliation");
            return {
              listed: 0,
              deactivated: 0,
              missingSet: 0,
              missingReset: 0,
            };
          }

          debug("[sync/all] Reconciliation (steamId-based)", {
            familyId: familyDbId,
            lygSteamIdsCount: activeSteamIds.length,
            validDbSteamIds: validSteamIds,
            invalidDbSteamIds: invalidSteamIds,
          });

          const now = new Date();

          // ✅ CRITICAL: Only mark as active if steamId matches valid format
          const listReconciled = await tx.member.updateMany({
            where: {
              familyId: familyDbId,
              steamId: { in: activeSteamIds },
            },
            data: {
              isActive: true,
              lastSeenAt: now,
              missingSince: null,
              missingFromLygSince: null,
            },
          });

          if (isPartialSync) {
            return {
              listed: listReconciled.count,
              deactivated: 0,
              missingSet: 0,
              missingReset: listReconciled.count,
            };
          }

          const protectedChef = {
            OR: [
              { grade: { in: ["CHEF", "COCHEF"] } },
              { rankLabel: { contains: "Chef" } },
            ],
          };

          const resetProtectedChef = await tx.member.updateMany({
            where: {
              familyId: familyDbId,
              steamId: { not: null },
              NOT: { steamId: { in: activeSteamIds } },
              ...protectedChef,
            },
            data: {
              missingFromLygSince: null,
            },
          });

          const missingSet = await tx.member.updateMany({
            where: {
              familyId: familyDbId,
              steamId: { not: null },
              missingFromLygSince: null,
              AND: [
                { NOT: { steamId: { in: activeSteamIds } } },
                { NOT: protectedChef },
              ],
            },
            data: {
              missingFromLygSince: now,
              missingSince: now,
            },
          });

          // ✅ CRITICAL: Only deactivate members with valid 17-digit steamIds NOT in LYG
          // Members with invalid steamIds stay untouched (they may have precision loss)
          const deactivated = await tx.member.updateMany({
            where: {
              familyId: familyDbId,
              steamId: { not: null },
              missingFromLygSince: { lte: graceCutoff },
              AND: [
                { NOT: { steamId: { in: activeSteamIds } } },
                { NOT: protectedChef },
              ],
            },
            data: {
              isActive: false,
              missingSince: now,
            },
          });

          return {
            listed: listReconciled.count,
            deactivated: deactivated.count,
            missingSet: missingSet.count,
            missingReset: listReconciled.count + resetProtectedChef.count,
          };
        });

        // Get final state after reconciliation
        const countAfterReconcile = await prisma.member.count({
          where: {
            familyId: familyDbId,
            isActive: true,
          },
        });

        debug("[sync/all] Reconciliation complete", {
          familyId: familyDbId,
          lygSteamIdsCount: activeSteamIds.length,
          listedInLyg: reconcileResult.listed,
          deactivated: reconcileResult.deactivated,
          missingSet: reconcileResult.missingSet,
          missingReset: reconcileResult.missingReset,
          graceDays,
          activeCountAfter: countAfterReconcile,
          summary: `${activeSteamIds.length} listed in LYG, ${reconcileResult.deactivated} deactivated`,
        });

        if (debugLyg) {
          console.log("[sync/all] LYG sync summary", {
            partialSync: isPartialSync,
            graceDays,
            listed: reconcileResult.listed,
            deactivated: reconcileResult.deactivated,
            missingSet: reconcileResult.missingSet,
            missingReset: reconcileResult.missingReset,
          });
        }

        // ✅ SESSION USER OVERRIDE: Ensure logged-in user is ALWAYS active (cannot become "ancien")
        if (sessionDiscordId) {
          const sessionUserMember = await prisma.member.findFirst({
            where: {
              familyId: familyDbId,
              discordId: sessionDiscordId,
            },
            select: {
              id: true,
              rpName: true,
              isActive: true,
              steamId: true,
            },
          });

          if (sessionUserMember) {
            if (!sessionUserMember.isActive) {
              // Reactivate session user (override any deactivation from reconciliation)
              await prisma.member.update({
                where: { id: sessionUserMember.id },
                data: {
                  isActive: true,
                  missingSince: null,
                  missingFromLygSince: null,
                },
              });
              console.log("[ACTIVE_OVERRIDE] Session user reactivated after reconciliation", {
                rpName: sessionUserMember.rpName,
                discordId: sessionDiscordId,
                steamId: sessionUserMember.steamId,
              });
            } else {
              console.log("[ACTIVE_OVERRIDE] Session user already active", {
                rpName: sessionUserMember.rpName,
                discordId: sessionDiscordId,
                steamId: sessionUserMember.steamId,
              });
            }
          }
        }

        // ✅ DISCORD ACTIVITY CHECK: Verify members are still active on Discord
        // Members must have a valid role (family, chef, or grade) AND be in the guild
        // This ensures "Actifs (Discord)" = truly active members
        debug("[sync/all] Starting Discord activity verification...");

        try {
          // Get all members with discordId in family
          const membersToCheck = await prisma.member.findMany({
            where: {
              familyId: familyDbId,
              discordId: { not: null },
            },
            select: {
              id: true,
              discordId: true,
              rpName: true,
              isActive: true,
            },
          });

          debug("[sync/all] Members to check on Discord", {
            totalWithDiscordId: membersToCheck.length,
          });

          if (membersToCheck.length > 0) {
            // Batch check discord activity
            const discordIds = membersToCheck.map((m) => m.discordId!);
            const discordActivityMap = await checkBatchDiscordActivity(discordIds);

            let discordActiveCount = 0;
            let discordInactiveCount = 0;
            let discordUnverifiableCount = 0;

            // Update member activity based on Discord status
            // Use transaction for consistency
            await prisma.$transaction(async (tx) => {
              for (const member of membersToCheck) {
                const discordActivity = discordActivityMap.get(member.discordId!);

                if (discordActivity === true) {
                  // Member is still active on Discord
                  if (member.isActive !== true) {
                    debug("[sync/all] Member reactivated via Discord check", {
                      memberId: member.id,
                      discordId: member.discordId,
                      rpName: member.rpName,
                    });
                    discordActiveCount++;
                  }
                  await tx.member.update({
                    where: { id: member.id },
                    data: { isActive: true },
                  });
                } else if (discordActivity === false) {
                  // Member is NOT active on Discord (no valid role or not in guild)
                  // This overrides LYG activity - Discord is source of truth for role/guild presence
                  if (member.isActive !== false) {
                    debug("[sync/all] Member deactivated via Discord check", {
                      memberId: member.id,
                      discordId: member.discordId,
                      rpName: member.rpName,
                      reason: "no_valid_role_or_not_in_guild",
                    });
                    discordInactiveCount++;
                  }
                  await tx.member.update({
                    where: { id: member.id },
                    data: { isActive: false },
                  });
                } else {
                  // discordActivity === null (API error, can't verify)
                  // Keep current state - don't change anything if we can't verify
                  discordUnverifiableCount++;
                  debug("[sync/all] Could not verify Discord activity", {
                    memberId: member.id,
                    discordId: member.discordId,
                    rpName: member.rpName,
                  });
                }
              }
            });

            debug("[sync/all] Discord activity check complete", {
              totalChecked: membersToCheck.length,
              activeOnDiscord: discordActiveCount,
              inactiveOnDiscord: discordInactiveCount,
              unverifiable: discordUnverifiableCount,
            });

            // ✅ SESSION USER OVERRIDE: Ensure logged-in user remains ACTIVE even after Discord check
            // If Discord can't verify the session user, we don't deactivate them
            // (they're currently using the app, so they're obviously active)
            if (sessionDiscordId) {
              const sessionUserWasDeactivated = membersToCheck.some(
                m => m.discordId === sessionDiscordId && !m.isActive
              );

              if (sessionUserWasDeactivated) {
                // Something went wrong - session user got deactivated by Discord check
                // Reactivate them immediately  
                const sessionMember = await prisma.member.findFirst({
                  where: {
                    familyId: familyDbId,
                    discordId: sessionDiscordId,
                  },
                  select: {
                    id: true,
                    rpName: true,
                  },
                });

                if (sessionMember) {
                  await prisma.member.update({
                    where: { id: sessionMember.id },
                    data: { isActive: true },
                  });
                  console.log("[ACTIVE_OVERRIDE] Session user reactivated after Discord check deactivation", {
                    rpName: sessionMember.rpName,
                    discordId: sessionDiscordId,
                  });
                }
              }
            }

            // Get final active count
            const finalActiveMembers = await prisma.member.count({
              where: {
                familyId: familyDbId,
                isActive: true,
              },
            });

            // Update result with Discord activity stats
            (result.members as any).discordActivityCheck = {
              totalChecked: membersToCheck.length,
              activeOnDiscord: discordActiveCount,
              inactiveOnDiscord: discordInactiveCount,
              unverifiable: discordUnverifiableCount,
              finalActivesTotal: finalActiveMembers,
            };
          }
        } catch (discordErr) {
          debug("[sync/all] Discord activity check error (non-blocking)", {
            error: discordErr instanceof Error ? discordErr.message : String(discordErr),
          });
          // Don't fail the whole sync, just log the error
          if (!result.warnings) result.warnings = [];
          result.warnings.push({
            type: "discord_activity_check_failed",
            error: "Failed to verify Discord activity for members",
            hint: "Members were synced with LYG, but Discord role verification failed. Manual check recommended.",
          });
        }

        // Get final count after Discord check (if it ran)
        const finalCountAfterDiscord = await prisma.member.count({
          where: {
            familyId: familyDbId,
            isActive: true,
          },
        });

        result.members = {
          ok: true,
          fetched: membersResponse.meta?.extractedCount || extractedMembers.length,
          upserted: upsertCount,
          updated: updateCount,
          skipped: skipCount + (membersResponse.meta?.skippedInvalid || 0),
          status: membersResponse.status,
          duration: membersResponse.duration,
          meta: membersResponse.meta,
          // ✅ Reconciliation stats (grace period)
          reconciliation: {
            lygSteamIdsCount: activeSteamIds.length,
            listedInLyg: reconcileResult.listed,
            deactivated: reconcileResult.deactivated,
          },
          // ✅ NEW: Count of active members per LYG logic (for UI display)
          activeSteamIdsCount,
          // Use final count after Discord check (if it ran), otherwise use post-reconciliation count
          finalActivesTotal: finalCountAfterDiscord,
        } as any;
      } catch (err: any) {
        logError("[sync/all] Error upserting members:", err.message);
        result.members = {
          ok: false,
          fetched: extractedMembers.length,
          upserted: upsertCount,
          updated: updateCount,
          skipped: skipCount,
          status: 500,
          error: err.message,
          reason: "upsert_error",
          meta: membersResponse.meta,
        };
        result.message = "Error upserting members to database.";
        const elapsedMs = Date.now() - startTime;
        logError("[sync/all] Sync FAILED after", elapsedMs, "ms");
        return NextResponse.json({ ...result, elapsedMs }, { status: 500 });
      }
    }

    // 2️⃣ PLAYTIME 7D (OPTIONAL)
    try {
      const playtime = await syncMemberPlaytime7d({
        familyId: familySlug,
        token: lygToken,
      });

      result.playtimeResult = {
        ok: true,
        fetched: playtime.fetched,
        scanned: playtime.scanned,
        updated: playtime.updated,
        resetToZero: playtime.resetToZero,
        skippedWithoutSteamId: playtime.skippedWithoutSteamId,
        unchanged: playtime.unchanged,
        missingFromSnapshot: playtime.missingFromSnapshot,
      };
    } catch (error: any) {
      result.playtimeResult = {
        ok: false,
        error: error?.message ?? String(error),
      };
      if (!result.warnings) result.warnings = [];
      result.warnings.push({
        type: "playtime7d",
        error: error?.message ?? "Playtime sync failed",
        hint: "Members sync succeeded; retry sync after checking LYG /familles/playtimes response.",
      });
    }

    // 3️⃣ INFOS (OPTIONAL - with endpoint probing)
    debug("[sync/all] Probing for infos endpoint...");
    const infosProbe = await lygProbeInfos(familySlug, {
      timeoutMs: 60_000,
    });

    if (!infosProbe.ok) {
      logError("[sync/all] Infos sync WARNING (non-critical):", infosProbe.error);
      result.infos = {
        ok: false,
        status: infosProbe.status,
        error: infosProbe.error,
      };
      if (!result.warnings) result.warnings = [];
      result.warnings.push({
        type: "infos",
        error: `Infos unavailable from LYG (${infosProbe.status})`,
        hint: `Probed ${infosProbe.probeResults.length} endpoints. Members synced successfully.`
      });
      // Don't fail - continue with banklogs sync
      debug("[sync/all] Continuing sync despite infos failure...", {
        endpointsProbed: infosProbe.probeResults.map(r => ({ path: r.path, status: r.status })),
      });
    } else {
      result.infos = {
        ok: true,
        status: 200,
      };

      debug("[sync/all] Infos synced successfully", {
        probedPath: infosProbe.probedPath,
      });
    }

    // 4️⃣ BANKLOGS (OPTIONAL - single source of truth)
    debug("[sync/all] Fetching banklogs from LYG...", {
      familyId: familySlug,
    });

    const banklogsResponse = await fetchLygBanklogs(familySlug, {
      timeoutMs: 60_000,
    });

    if (!banklogsResponse.ok) {
      logError("[sync/all] Banklogs sync warning:", {
        status: banklogsResponse.status,
        error: banklogsResponse.error,
        bodySnippet: banklogsResponse.text?.slice(0, 200),
      });
      result.banklogs = {
        ok: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        status: banklogsResponse.status,
        error: banklogsResponse.error,
        bodySnippet: banklogsResponse.text?.slice(0, 800),
        duration: banklogsResponse.durationMs,
      };
      if (!result.warnings) result.warnings = [];
      result.warnings.push({
        type: "banklogs",
        error: banklogsResponse.error || "Unknown error",
        hint: "Bank logs could not be synced.",
      });
    } else {
      const logsList = Array.isArray(banklogsResponse.data)
        ? banklogsResponse.data
        : [];
      debug("[sync/all] Banklogs synced successfully", {
        count: logsList.length,
        endpoint: banklogsResponse.url,
      });
      result.banklogs = {
        ok: true,
        inserted: logsList.length,
        updated: 0,
        skipped: 0,
        status: banklogsResponse.status,
        duration: banklogsResponse.durationMs,
        resolvedEndpoint: banklogsResponse.url,
      };
    }

    // ✅ Final status: ok if members synced (infos and banklogs are non-critical)
    result.ok = true;
    result.message =
      !result.warnings || result.warnings.length === 0
        ? `Sync OK: ${result.members.upserted || 0} new members, ${result.members.updated || 0} updated`
        : `Partial sync: ${result.members.upserted || 0} new, ${result.members.updated || 0} updated, ${result.warnings.length} warning(s)`;

    const elapsedMs = Date.now() - startTime;
    debug("[sync/all] Sync complete", {
      ok: result.ok,
      members: {
        fetched: result.members.fetched,
        upserted: result.members.upserted,
        updated: result.members.updated,
        skipped: result.members.skipped,
      },
      warnings: result.warnings?.length || 0,
      elapsedMs,
    });

    // Log to production (important for debugging)
    console.log(`[sync/all] ${new Date().toISOString()} - ${result.message}`, {
      ok: result.ok,
      membersFetched: result.members.fetched,
      membersUpserted: result.members.upserted,
      membersUpdated: result.members.updated,
      membersSkipped: result.members.skipped,
      banklogsOk: result.banklogs?.ok,
      warnings: result.warnings?.length || 0,
      elapsedMs,
    });

    // Revalidate cached pages
    try {
      revalidatePath("/staff/members");
      revalidatePath("/staff/banklogs");
      debug("[sync/all] Cache revalidated");
    } catch (err: any) {
      debug("[sync/all] Cache revalidation error (non-critical):", err.message);
    }

    return NextResponse.json({ ...result, elapsedMs });
  } catch (err: any) {
    const elapsedMs = Date.now() - startTime;
    logError("[sync/all] Unexpected error:", err);
    console.error(`[sync/all] ${new Date().toISOString()} - FAILED after ${elapsedMs}ms:`, err.message);
    return NextResponse.json(
      {
        ok: false,
        elapsedMs,
        members: { ok: false, error: "Internal error", reason: "exception" },
        infos: { ok: false, error: "Internal error" },
        warnings: [],
        message: "Internal server error",
      },
      { status: 500 }
    );
  } finally {
    if (lockAcquired && lockKey) {
      releaseSyncLock(lockKey);
    }
  }
}
