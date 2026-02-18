# Discord Complaints Setup (Runbook)

This document covers install, Prisma migrations, Windows EPERM fixes, and how to run the Discord complaints bot alongside Next.js.

## Install

```bash
npm install
npm install discord.js
```

If you do not already have tsx available (used by `discord:bot`):

```bash
npm install -D tsx
```

## Windows: stop processes before Prisma

Before any Prisma `generate` or `migrate` step:
- Stop Next dev server (Ctrl+C)
- Stop the Discord bot (Ctrl+C)
- Stop any other Node processes

If EPERM persists on Windows:

```cmd
taskkill /F /IM node.exe
```

Optional cleanup (then reinstall + generate):

```cmd
rmdir /S /Q node_modules\.prisma
rmdir /S /Q node_modules\@prisma\client
npm install
npx prisma generate
```

If EPERM still happens:
- Run the terminal as Administrator
- Check antivirus or Windows Defender exclusions for the project folder

## Migration strategy

There are two supported paths. Choose ONE.

### Path A: local dev (recommended)
Use this when your dev DB is fresh or you can safely run migrate dev.

```bash
npx prisma migrate dev
npx prisma generate
npm run dev
```

### Path B: baseline / existing DB / non-interactive
Use this when the DB already has schema and `migrate dev` is not applicable.

1) Make sure the DB already contains the expected schema.
2) Mark a migration as applied (baseline):
```bash
npx prisma migrate resolve --applied <migration_folder_name>
```
3) Apply remaining migrations:
```bash
npx prisma migrate deploy
```
4) Generate Prisma client:
```bash
npx prisma generate
```

Important:
- `migrate deploy` only applies migrations not marked as applied.
- If no migrations are applied but the DB already exists, baseline the first migration, then deploy.

## Discord config + intents

1) In the panel, go to `/staff/discord/config` (chef only):
   - Set `complaintCategoryId` (Discord category that contains complaint tickets)
   - Save

2) Env vars:
```
DISCORD_BOT_TOKEN=xxxxx
GUILD_ID=xxxxx   # optional, filters to one guild
```

3) Discord Dev Portal -> Bot -> Privileged Gateway Intents:
   - Enable **Message Content Intent**

4) Bot permissions in the server:
   - View Channels / Read Messages
   - Read Message History
   - Access to threads if your ticket tool uses threads

## Run

Terminal A (Next):
```bash
npm run dev
```

Terminal B (bot):
```bash
npm run discord:bot
```

## Validation checklist

### Archiving
- Create or open a complaint ticket in Discord (correct category)
- Send a message => appears in DB and in UI
- Edit the message => `editedAtDiscord` is set and UI shows "edited"
- Delete the message => `deletedAtDiscord` is set and UI shows "deleted"
- Attachments show as links in the UI

### Near real-time
- Open `/staff/complaints/[id]`
- Verify polling every ~1-2s brings new messages without refresh

### Ticket status
- Update status to TREATED / UNTREATED / CLOSED
- Status persists and list reflects it

### Security
- Non-staff request to `/api/staff/*` returns 403

## Note on enums

- `ComplaintStatus` already exists for the legacy `Complaint` model.
- Tickets use `ComplaintTicketStatus` to avoid breaking existing data.
- Optionally these can be merged later if you migrate the legacy model.
