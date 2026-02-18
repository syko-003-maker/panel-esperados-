# Discord Outbox Worker

This worker consumes Discord outbox jobs and sends embeds for member events.

## Prereqs
- Configure these fields in `/staff/discord/config`:
  - `recruitmentChannelId` (required for recruitment decisions; can be auto-initialized)
  - `absencesChannelId` (required)
  - `sanctionsChannelId` (required)
  - `bankAlertsChannelId` (required for debt pings)
  - `logsChannelId` (optional)
- Ensure `DISCORD_BOT_TOKEN` is set in the environment.

## Run
Terminal A:
- `npm run dev`

Terminal B:
- `npm run discord:worker`

## Env
- `DISCORD_BOT_TOKEN` (required)
- `WORKER_POLL_MS` (optional, default 1000)
- `WORKER_BATCH_SIZE` (optional, default 10)
- `DEFAULT_RECRUITMENT_CHANNEL_ID` (optional; used for auto-init and fallback)
- `AUTO_INIT_DISCORD_CHANNELS` (optional; defaults to true in dev, false in prod)

## Validation
- Create an absence via `/me` -> job created -> embed in absences channel.
- Justify an absence -> embed in absences channel.
- Justify a sanction -> embed in sanctions channel.
- Set a bad channel ID -> job retries, then fails after max attempts.
- Confirm a SENT job does not resend.
