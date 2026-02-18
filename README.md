This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Justifications → Discord Pipeline (Diagnostic)

When members submit justifications (absence/sanction), they are sent to Discord channels.

### Configuration Requirements

Both **panel** and **worker** need the same secret:

**Panel (.env.prod or .env.local):**
```bash
INGEST_SECRET=your_shared_secret
WORKER_INTERNAL_URL=http://127.0.0.1:3001  # Default, only change if worker on different host
```

**Worker (.env.prod or .env):**
```bash
INGEST_SECRET=your_shared_secret  # Must match panel's INGEST_SECRET
```

### Test Endpoint

If justifications aren't appearing on Discord, test the pipeline:

```bash
# As chef (authenticated):
curl "http://localhost:3000/api/member/_test-discord?channel=absence"
# or
curl "http://localhost:3000/api/member/_test-discord?channel=sanction"
```

Response:
```json
{
  "ok": true,
  "message": "Test message envoyé avec succès",
  "channel": "absence",
  "messageId": "1234567890123456789",
  "debug": {
    "workerUrl": "http://127.0.0.1:3001",
    "timestamp": "2026-01-31T12:34:56.789Z"
  }
}
```

If test fails, check logs:

**Dev logs (enable with DEBUG_DISCORD_POST=true):**
```bash
npm run dev  # Logs show [discord-post] with URL, status, response
```

**Common issues:**
- `INGEST_SECRET missing in panel env` → Panel .env missing INGEST_SECRET
- `Unauthorized` → Panel and worker INGEST_SECRET don't match
- `Channel not found` → Discord channel ID invalid or bot no access
- `http://127.0.0.1:3001: connect ECONNREFUSED` → Worker not running

### Channels

- **Absence**: `1335303582043607222`
- **Sanction**: `1409028569203740792`

### Debug Logging

Enable detailed logs:
```bash
# Panel
DEBUG_DISCORD_POST=true npm run dev

# Worker
npm run dev  # Logs include "internal_post_message_attempt", "internal_post_message_success"
```

## Notes

- After a DB reset/migration, sign in again to refresh the auth session.
- When passing Prisma data to Client Components, serialize to plain JSON (Date -> ISO string, Decimal/BigInt -> string or number).
- For local OAuth, always use http://localhost:3000 (avoid LAN IP/127.0.0.1) to prevent "state cookie missing".
- In the Discord Dev Portal, add redirect URI: http://localhost:3000/api/auth/callback/discord

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
