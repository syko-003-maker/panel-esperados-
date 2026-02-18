import { NextResponse } from 'next/server';

// Placeholder MVP (enqueue proprement quand la feature est prête)
async function enqueueDiscordJobPlaceholder(job: any) {
  console.log('[discord-queue] placeholder - job not enqueued yet:', job);
  // TODO: implémenter enqueueDiscordJob quand outbox est stable
}

export async function POST(req: Request) {
  const body = await req.json();

  // ✅ PLACEHOLDER:
  await enqueueDiscordJobPlaceholder({ type: 'SANCTION_NOTIFY', meta: {} });

  return NextResponse.json({ ok: true });
}
