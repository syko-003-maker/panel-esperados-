# Migration Note - remove_ticket_models

Prisma migration creation failed because the shadow database cannot apply historical migration `20260122010024_add_ticket_threads_and_sync` (missing index `TicketMessage_familyId_ticketKind_ticketId_createdAt_idx`).

To keep production safe and persistent:
- A manual migration was created in `prisma/migrations/20260130120000_remove_ticket_models/migration.sql`.
- This migration drops the legacy `TicketMessage` table and its indexes (Ticket/TicketMessage are removed from schema).

Follow-up:
- Apply the SQL manually (or via `prisma db execute --file ...`) if `migrate dev` cannot run due to shadow DB issues.
- Then mark it applied with `prisma migrate resolve --applied 20260130120000_remove_ticket_models`.
