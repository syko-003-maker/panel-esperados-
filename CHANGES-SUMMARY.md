# Changes Summary (Stabilization Final)

## Routes affectées

### Routes dépréciées (410 Gone)
- `/api/tickets/[id]/decision`
- `/api/tickets/[id]/messages`
- `/api/tickets/[id]/resync`

### Routes ajoutées / renommées
- `DELETE /api/staff/members/[id]` → `ADD /api/staff/members/by-id/[id]`

## Fichiers supprimés / renommés
- `src/app/` (dossier supprimé : doublon d’App Router)
- `app/api/staff/members/[id]/route.ts` (supprimé)
- `app/api/staff/members/by-id/[id]/route.ts` (ajouté)

## Migrations Prisma ajoutées
- 20260130120000_remove_ticket_models (manuel, voir MIGRATION-NOTE.md)

## Note finale
- Modèles `Ticket` et `TicketMessage` retirés du schema Prisma (routes `/api/tickets/*` conservées en 410).
- Migration manuelle ajoutée: `20260130120000_remove_ticket_models` (voir MIGRATION-NOTE.md).
- Alignement du modèle `BankLog` avec l’historique des migrations + fix de replay Shadow DB (TicketMessage index/table idempotent).

## Source officielle App Router
- **Source officielle :** `app/`
- **Vérification :** `app/` existe, `src/app/` n’existe plus.

## Mega Patch — Sécurité + OVH + Audits + Tests
- Ajout page staff forbidden: `app/staff/forbidden/page.tsx`
- Redirections staff propres: non lié → `/staff/link`, lié non autorisé → `/staff/forbidden`
- Audits auth (ACCESS_ALLOWED / ACCESS_DENIED / AUTH_LOGIN) avec anti-spam 60s
- Script tests d’accès: `scripts/verify-access.ps1`
- Prépa OVH: `docker-compose.prod.yml` + `Caddyfile` + `env/.env.ovh.template`
- Scripts prod: `scripts/prod-up.*`, `scripts/prod-migrate.*`, `scripts/prod-logs.*`, `scripts/prod-down.*`
- Debug staff désactivable (404): `/staff/debug/auth` via `ENABLE_STAFF_DEBUG=0`
