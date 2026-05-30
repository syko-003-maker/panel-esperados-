import { NextResponse } from 'next/server';

// ⚠️ SÉCURITÉ : cette route (POST + GET) est DÉSACTIVÉE.
// C'était un doublon NON AUTHENTIFIÉ de l'intake de recrutement : elle créait
// un Recruitment + un job Discord à partir d'un body arbitraire (discordId,
// rpName, steamId, et même createdById usurpable) sans aucune vérification —
// n'importe qui pouvait injecter des tickets et spammer le salon Discord.
// Le vrai flux passe par /api/discord/recruitment (worker) et
// /api/ingest/tickets (gardé par x-ingest-secret). On renvoie 404 sur les
// deux méthodes pour fermer la surface d'attaque.

export async function GET() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}
