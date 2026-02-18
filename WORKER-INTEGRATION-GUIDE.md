# Worker Integration Guide - Discord Message Posting

## Overview

The Los Esperados Panel's member absence/sanction justification features require a worker endpoint to post Discord messages securely.

## Endpoint Contract

```
Method: POST
URL: /internal/discord/postMessage
Auth: Header X-Ingest-Secret (must match env var INGEST_SECRET)
```

## Request

```json
{
  "channelId": "1335303582043607222",
  "content": "**Justification d'Absence**\n\n👤 Membre: rpName (123456789)\n📅 Période: du 2026-01-31 au 2026-02-02\n💬 Raison: Vacation",
  "embeds": []
}
```

## Response - Success

```json
{
  "success": true,
  "messageId": "1234567890"
}
```

## Response - Error

```json
{
  "error": "Member not found in guild"
}
```

## Implementation (Node.js/Discord.js Example)

```typescript
import express from "express";
import { Client, ChannelType } from "discord.js";

const app = express();
app.use(express.json());

const INGEST_SECRET = process.env.INGEST_SECRET;
const client = new Client({ intents: ["Guilds", "GuildMessages"] });

// Middleware: Verify secret
app.use((req, res, next) => {
  const secret = req.headers["x-ingest-secret"];
  if (secret !== INGEST_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// Endpoint
app.post("/internal/discord/postMessage", async (req, res) => {
  try {
    const { channelId, content, embeds } = req.body;

    if (!channelId || !content) {
      return res.status(400).json({ error: "Missing channelId or content" });
    }

    // Get channel from Discord
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return res.status(400).json({ error: "Invalid channel" });
    }

    // Send message
    const message = await channel.send({
      content,
      embeds: embeds || [],
    });

    return res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error("Discord posting error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Connect Discord bot and start server
client.login(process.env.DISCORD_TOKEN);
client.once("ready", () => {
  app.listen(3001, () => {
    console.log("✓ Worker listening on port 3001");
  });
});
```

## Environment Variables Required

```bash
# Worker
DISCORD_TOKEN=your-bot-token
INGEST_SECRET=your-secret-token

# Panel (for calling worker)
WORKER_INTERNAL_URL=http://127.0.0.1:3001
INGEST_SECRET=your-secret-token  # Same value
```

## Discord Channel IDs

- **Absence Justifications**: `1335303582043607222`
- **Sanction Justifications**: `1409028569203740792`

Ensure the Discord bot has `Send Messages` permission in both channels.

## Message Format Examples

### Absence Justification

```
**Justification d'Absence**

👤 Membre: crakers76 (123456789)
📅 Période: du 2026-01-31 au 2026-02-02
💬 Raison: Vacation en famille
```

### Sanction Justification

```
**Justification de Sanction**

👤 Membre: john_doe (987654321)
🏷️ Sanction ID: SANC-001
📝 Contexte: Accident lors d'une mission
💬 Justification: Je n'avais pas vu le panneaux d'interdiction
```

## Testing

```bash
# Test endpoint locally
curl -X POST http://127.0.0.1:3001/internal/discord/postMessage \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Secret: your-secret-token" \
  -d '{
    "channelId": "1335303582043607222",
    "content": "Test message"
  }'
```

## Security Notes

- ✅ All requests require valid X-Ingest-Secret header
- ✅ Worker runs on internal network (127.0.0.1:3001)
- ✅ Only accepted Discord channels are targets
- ✅ Rate limiting recommended
- ✅ Error messages don't leak sensitive info

## Deployment

1. Ensure worker server is running before panel
2. Verify INGEST_SECRET matches in both services
3. Test worker endpoint from panel before production
4. Monitor worker logs for Discord API errors
5. Check Discord channel permissions regularly

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" | Check X-Ingest-Secret header matches INGEST_SECRET |
| "Invalid channel" | Verify channelId is correct and bot has access |
| "Member not found" | Bot not in guild or missing permissions |
| Connection refused | Worker not running or wrong URL |
| 500 error | Check Discord API rate limits or bot token validity |
