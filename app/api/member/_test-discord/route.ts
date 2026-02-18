import { auth } from "@/auth";
import { getUserRole } from "@/server/auth/rbac";
import { postDiscordMessage } from "@/server/worker/post-discord";
import { NextRequest, NextResponse } from "next/server";

const DISCORD_CHANNELS = {
  absence: "1335303582043607222",
  sanction: "1409028569203740792",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(session);
  if (role !== "chef") {
    return NextResponse.json({ ok: false, error: "Only chef can test" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") || "absence";

  if (!["absence", "sanction"].includes(channel)) {
    return NextResponse.json(
      { ok: false, error: "Invalid channel: use absence|sanction" },
      { status: 400 }
    );
  }

  const channelId = DISCORD_CHANNELS[channel as keyof typeof DISCORD_CHANNELS];
  const now = new Date().toISOString();

  const embed = {
    title: "🧪 TEST DISCORD PIPELINE",
    description: "Cet envoi valide que le pipeline justifs -> Discord fonctionne.",
    color: 0x10b981,
    fields: [
      { name: "Canal", value: channel, inline: true },
      { name: "Timestamp", value: now, inline: true },
      { name: "Status", value: "✅ ENVOI TEST", inline: false },
    ],
    footer: { text: "Si tu vois ce message, la pipeline fonctionne!" },
  };

  const result = await postDiscordMessage({
    channelId,
    embeds: [embed],
  });

  if (!result.ok) {
    console.error("[test-discord] Failed:", result.error);
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        debug: {
          channel,
          channelId,
          workerUrl: process.env.WORKER_INTERNAL_URL || "http://127.0.0.1:3001",
          hasSecret: !!process.env.INGEST_SECRET,
        },
      },
      { status: 500 }
    );
  }

  console.log("[test-discord] Success:", { channel, messageId: result.messageId });
  return NextResponse.json({
    ok: true,
    message: "Test message envoyé avec succès",
    channel,
    messageId: result.messageId,
    debug: {
      workerUrl: process.env.WORKER_INTERNAL_URL || "http://127.0.0.1:3001",
      timestamp: now,
    },
  });
}
