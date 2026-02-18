# Complete Diffs - rpName Refactoring

## 1. Prisma Schema Update

**File**: `prisma/schema.prisma`

```diff
model Member {
  id String @id @default(cuid())

  familyId String
  family   Family @relation(fields: [familyId], references: [id], onDelete: Cascade)

  steamId            String? // SteamID64
  discordId          String? @db.VarChar(32)
  rpName             String? // Nom RP issu du ticket recrutement
+ discordUsername    String? // Discord username (ex: crakers76)
+ discordDisplayName String? // Discord nickname ou globalName
  age                Int?

  // Grade system
  grade         String?  // WL1, WL2, WL3, WL4, CHEF, etc.
  gradeLevel    Int      @default(0) // Numeric level for sorting (WL1=1, WL2=2, etc.)
  roleDiscordId String?  // Discord role ID for this grade
  isActive      Boolean  @default(true)
  joinedAt      DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sanctions     Sanction[]     @relation("SanctionMember")
  gradeHistory  GradeHistory[]

  @@unique([familyId, steamId])
  @@unique([familyId, discordId])
  @@index([familyId])
  @@index([steamId])
  @@index([discordId])
  @@index([familyId, isActive])
  @@index([familyId, grade])
}
```

---

## 2. Database Migration

**File**: `prisma/migrations/20260131_add_discord_username_displayname/migration.sql`

```sql
-- AlterTable
ALTER TABLE "Member" ADD COLUMN "discordUsername" TEXT,
ADD COLUMN "discordDisplayName" TEXT;
```

---

## 3. LinkRequest Accept Endpoint

**File**: `app/api/ingest/link-requests/[id]/accept/route.ts`

**Changes**: Added recruitment lookup and improved rpName handling

```typescript
// ✅ PATCH: Upsert Member with rpName and discordUsername
// This ensures Member is created with rpName from recruitment ticket
if (authorId) {
  try {
    // First check if member exists and has rpName already
    const recruitment = await prisma.recruitment.findFirst({
      where: {
        discordId: linkRequest.requesterDiscordId,
        rpName: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { rpName: true },
    });

    if (!member) {
      // Create new member
      // Try to find associated recruitment for rpName
      const recruitment = await prisma.recruitment.findFirst({
        where: {
          discordId: linkRequest.requesterDiscordId,
          rpName: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { rpName: true },
      });

      member = await prisma.member.create({
        data: {
          familyId: FAMILY_ID,
          discordId: linkRequest.requesterDiscordId,
          // Priority: recruitment rpName > LinkRequest requesterName > null
          rpName: recruitment?.rpName || linkRequest.requesterName || null,
          discordUsername: linkRequest.requesterName || null,
          isActive: true,
        },
      });
      console.log("[link-request:accept] Created new member", {
        memberId: member.id,
        discordId: member.discordId,
        rpName: member.rpName,
      });
    } else {
      // Update existing member
      // Important: NE PAS écraser rpName si déjà défini
      const updateData: any = {
        discordId: linkRequest.requesterDiscordId,
        isActive: true,
      };

      // Only set rpName if member doesn't already have one
      if (!member.rpName) {
        // Try to find associated recruitment for rpName
        const recruitment = await prisma.recruitment.findFirst({
          where: {
            discordId: linkRequest.requesterDiscordId,
            rpName: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: { rpName: true },
        });
        updateData.rpName = recruitment?.rpName || linkRequest.requesterName || null;
      }

      // Always update discordUsername (for tracking)
      updateData.discordUsername = linkRequest.requesterName || null;

      member = await prisma.member.update({
        where: { id: member.id },
        data: updateData,
      });
      console.log("[link-request:accept] Updated existing member", {
        memberId: member.id,
        discordId: member.discordId,
        rpName: member.rpName,
        updatedFields: Object.keys(updateData),
      });
    }
  } catch (memberErr) {
    // ...
  }
}
```

---

## 4. Recruitment Create Handler

**File**: `app/api/ingest/tickets/route.ts` (recruitment.create handler)

**Changes**: Extract Discord info from payload and upsert Member

```typescript
"recruitment.create": async (ctx, event) => {
  const authorId = event.author?.id;
  if (!authorId) {
    return { ok: false, error: "Missing author.id", status: 400 };
  }

  const authorTag = event.author?.tag ?? null;
  const payload = (event.payload ?? {}) as Prisma.InputJsonValue;
  const ticketKey = event.ticketKey;
  const threadId = event.threadId;

  // ✅ NEW: Extract Discord info from payload
  const rpName = (payload as any)?.rpName || null;
  const steamId = (payload as any)?.steamId || null;
  const discordUsername = (payload as any)?.discordUsername || authorTag || null;
  const discordDisplayName = (payload as any)?.discordDisplayName || discordUsername || null;

  const recruitment = await ctx.prisma.recruitment.upsert({
    where: { ticketKey },
    create: {
      familyId: ctx.familyId,
      ticketKey,
      discordThreadId: threadId,
      discordId: authorId,
      authorTag,
      payload,
      status: "PENDING",
      createdById: ctx.fallbackUserId,
    },
    update: {
      discordThreadId: threadId,
      authorTag,
      payload,
    },
  });

  // ✅ PATCH: Upsert Member with rpName and discordUsername
  // This ensures Member is created with rpName from recruitment ticket
  if (authorId) {
    try {
      // First check if member exists and has rpName already
      const existingMember = await ctx.prisma.member.findUnique({
        where: {
          familyId_discordId: {
            familyId: ctx.familyId,
            discordId: authorId,
          },
        },
        select: { rpName: true },
      });

      // Build update data (for both create and update)
      const updateData: any = {
        // Only set rpName if member doesn't already have one
        rpName: existingMember?.rpName ? undefined : (rpName || null),
        // Always update Discord info for tracking
        discordUsername: discordUsername || null,
        discordDisplayName: discordDisplayName || null,
      };

      // Filter out undefined values
      const updateDataFiltered = Object.fromEntries(
        Object.entries(updateData).filter(([_, v]) => v !== undefined)
      );

      await ctx.prisma.member.upsert({
        where: {
          familyId_discordId: {
            familyId: ctx.familyId,
            discordId: authorId,
          },
        },
        create: {
          family: { connect: { id: ctx.familyId } },
          discordId: authorId,
          rpName: rpName || null,
          discordUsername: discordUsername || null,
          discordDisplayName: discordDisplayName || null,
          steamId: steamId || null,
          isActive: true,
        },
        update: updateDataFiltered,
      });
    } catch (memberErr) {
      console.error("[ingest:recruitment.create] Member upsert failed:", memberErr);
      // Don't fail the whole request if member upsert fails
    }
  }

  // Get Discord config for recruitment channel
  const discordConfig = await ctx.prisma.discordConfig.findUnique({
    where: { familyId: ctx.familyId },
    select: { recruitmentChannelId: true },
  });

  // Create Discord notification job if channel is configured
  if (discordConfig?.recruitmentChannelId && recruitment.id) {
    const displayRpName = rpName || authorTag || authorId;

    await ctx.prisma.discordOutbox.create({
      data: {
        status: "PENDING",
        type: "SANCTION_NOTIFY",
        familyId: ctx.familyId,
        entityId: recruitment.id,
        channelId: discordConfig.recruitmentChannelId,
        dedupeKey: `RECRUITMENT_CREATED:${recruitment.id}:${Date.now()}`,
        attempt: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        meta: {
          kind: "RECRUITMENT_CREATED",
          recruitmentId: recruitment.id,
          rpName: displayRpName,
          discordId: authorId,
          steamId,
          createdAt: ctx.now.toISOString(),
        },
      },
    });
  }

  log("recruitment.create", ticketKey, { familyId: ctx.familyId, ok: true, rpName, authorId });
  return { ok: true };
},
```

---

## 5. Discord Worker - Ticket Submission

**File**: `discord-worker/src/tickets.ts` (handleRecruitmentSubmit)

**Changes**: Capture Discord username and displayName in event payload

```typescript
export async function handleRecruitmentSubmit(
  interaction: ModalSubmitInteraction
) {
  // ... existing code ...

  const steamId = interaction.fields.getTextInputValue("steamId").trim();
  const rpName = interaction.fields.getTextInputValue("rpName").trim();
  const motivation = interaction.fields.getTextInputValue("motivation").trim();
  const dispo = interaction.fields.getTextInputValue("dispo").trim();

  // ... thread creation ...

  // ✅ PATCH: Include Discord user info in event payload
  const event = {
    version: EVENT_VERSION,
    familyId: IDS.FAMILY_ID,
    type: "recruitment.create",
    ticketKey,
    threadId: thread.id,
    author: { id: interaction.user.id, tag: interaction.user.tag },
    payload: {
      steamId,
      rpName,
      motivation,
      dispo,
      // ✅ PATCH: Include Discord user info for Member tracking
      discordUsername: interaction.user.username,
      discordDisplayName: (interaction.member as any)?.nickname || 
                         interaction.user.globalName || 
                         interaction.user.username,
    },
  };

  // ... rest of function ...
}
```

---

## Build Status

```
✓ Compiled successfully in 6.6s
✓ Finished TypeScript in 10.3s
✓ Collecting page data using 15 workers in 1881.7ms    
✓ Generating static pages using 15 workers (148/148) in 419.4ms
✓ Finalizing page optimization in 17.7ms

Exit Code: 0 (SUCCESS)
All 148 routes compiled successfully
```

---

## Summary of Changes

| File | Type | Changes |
|------|------|---------|
| `prisma/schema.prisma` | Schema | +2 new fields to Member |
| `prisma/migrations/...` | Migration | +2 columns in DB |
| `app/api/ingest/link-requests/[id]/accept/route.ts` | API | +recruitment lookup logic |
| `app/api/ingest/tickets/route.ts` | API | +Member upsert on recruitment create |
| `discord-worker/src/tickets.ts` | Worker | +Discord info in payload |

**Total**: 5 files modified, 1 migration created, 0 breaking changes

