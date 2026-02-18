# Security Notes

- Panel privé: aucun accès public.
- Accès staff strict: Owner override (Discord ID) ou Chef famille (role).
- Non lié → redirect /staff/link; lié mais non autorisé → /staff/forbidden.
- STAFF_ROLE_ID optionnel: seulement pour mentions Discord.
- Debug staff: /staff/debug/auth désactivable via ENABLE_STAFF_DEBUG=0 (404).
- Tunnel trycloudflare: usage temporaire, OVH prévu.
