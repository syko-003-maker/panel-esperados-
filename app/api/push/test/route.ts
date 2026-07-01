import { NextResponse } from "next/server";
import { resolveDiscordId } from "../_scope";
import { sendPushToDiscordIds } from "@/lib/push";

export async function POST() {
  const discordId = await resolveDiscordId();
  if (!discordId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const res = await sendPushToDiscordIds([discordId], {
    title: "🔔 Notifications activées",
    body: "Tu recevras bien les alertes du panel Los Esperados ici.",
    url: "/dashboard",
    tag: "push-test",
  });
  return NextResponse.json({ ok: true, ...res });
}
