# OVH Deploy — Checklist (Jour J)

## 1) Préparation (avant DNS)
- [ ] Copier env/.env.ovh.template → env/.env.ovh
- [ ] Remplir toutes les variables __FILL_ME__
- [ ] Vérifier OWNER_DISCORD_ID et CHEF_FAMILLE_ROLE_ID
- [ ] Vérifier DATABASE_URL (postgres service name)

## 2) Build & Migrations
- [ ] scripts/prod-up.ps1 (ou .sh)
- [ ] scripts/prod-migrate.ps1 (ou .sh)

## 3) Reverse Proxy HTTPS
- [ ] Configurer Caddy (Caddyfile) ou Nginx
- [ ] Remplacer example.com par le domaine réel
- [ ] Ouvrir ports 80/443

## 4) Validation
- [ ] /api/health → 200
- [ ] /staff/debug/auth → 404 si ENABLE_STAFF_DEBUG=0
- [ ] Owner accès OK
- [ ] Chef famille accès OK
- [ ] Membre normal → /staff/forbidden

## 5) Post-déploiement
- [ ] Activer backups DB
- [ ] Monitorer logs (scripts/prod-logs.ps1|.sh)
- [ ] Mettre à jour DNS quand prêt
