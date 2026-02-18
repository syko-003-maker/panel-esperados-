# Checklist Déploiement Production

## Prérequis

- [ ] Accès au serveur de production
- [ ] Accès au Discord Developer Portal
- [ ] Accès à la base de données
- [ ] Variables d'environnement prêtes

---

## 1. Configuration Next.js Panel

### Variables d'environnement (.env)

- [ ] `DATABASE_URL` configuré
- [ ] `NEXTAUTH_URL` configuré (URL publique)
- [ ] `NEXTAUTH_SECRET` généré (32+ caractères)
- [ ] `DISCORD_CLIENT_ID` configuré
- [ ] `DISCORD_CLIENT_SECRET` configuré
- [ ] `INGEST_SECRET` généré (32+ caractères, identique au worker)
- [ ] `NEXT_PUBLIC_DISCORD_GUILD_ID` configuré
- [ ] `FAMILY_ID` configuré (ou laisser défaut "esperados")

### Vérification

```bash
npm run build
# Exit code doit être 0

npm start
curl http://localhost:3000/api/health
# Doit retourner { "ok": true, "db": true }
```

---

## 2. Configuration Discord Worker

### Variables d'environnement (.env)

- [ ] `DISCORD_TOKEN` configuré
- [ ] `GUILD_ID` configuré
- [ ] `CONTACT_CHANNEL_ID` configuré
- [ ] `TICKETS_PARENT_CHANNEL_ID` configuré
- [ ] `TICKETS_LOGS_CHANNEL_ID` configuré
- [ ] `INGEST_BASE_URL` configuré (URL publique du panel)
- [ ] `INGEST_SECRET` configuré (identique au panel)
- [ ] `STAFF_ROLE_ID` configuré (optionnel)
- [ ] `PANEL_BASE_URL` configuré (URL publique du panel)
- [ ] `TICKETS_OPEN_LIMIT` configuré (défaut: 1)
- [ ] `FAMILY_ID` configuré (identique au panel)

### Vérification

```bash
cd discord-worker
npm run build
npm start
# Logs doivent afficher:
# - worker_ready
# - panel_health_ok (ou panel_health_warn)
# - contact_panel_created ou contact_panel_updated
# - channel_access_ok pour chaque salon
```

---

## 3. Permissions Discord Bot

### Serveur Discord

- [ ] Bot invité sur le serveur
- [ ] Bot a le rôle avec les permissions requises
- [ ] Bot peut voir les 3 salons (CONTACT, TICKETS_PARENT, TICKETS_LOGS)

### Permissions requises

- [ ] View Channels
- [ ] Send Messages
- [ ] Send Messages in Threads
- [ ] Create Private Threads
- [ ] Manage Threads
- [ ] Read Message History
- [ ] Embed Links

---

## 4. Tests Fonctionnels

### Panneau Contact

- [ ] Message Contact visible dans le salon CONTACT
- [ ] Boutons "Recrutement" et "Plainte" cliquables

### Création Ticket Recrutement

- [ ] Clic bouton → Modal s'ouvre
- [ ] Submit → Thread créé dans TICKETS_PARENT
- [ ] Message embed visible dans le thread
- [ ] Bouton "OUVRIR SUR LE PANEL" fonctionne
- [ ] Ticket visible sur `/staff/recruitments`

### Création Ticket Plainte

- [ ] Clic bouton → Modal s'ouvre
- [ ] Submit → Thread créé dans TICKETS_PARENT
- [ ] Message embed visible dans le thread
- [ ] Ticket visible sur `/staff/complaints-tickets`

### Fermeture Ticket

- [ ] Clic bouton fermeture → Thread lock
- [ ] Thread archivé
- [ ] Log envoyé dans TICKETS_LOGS
- [ ] Status mis à jour sur le panel

### Anti-Spam

- [ ] 2e création dans les 30s → Refusé
- [ ] 2e ticket alors que 1 ouvert → Refusé (si LIMIT=1)

---

## 5. Panel Staff

### Dashboard

- [ ] `/staff/dashboard` affiche les compteurs
- [ ] Derniers tickets visibles
- [ ] Liens Discord et Panel fonctionnent

### Diagnostics

- [ ] `/staff/diagnostics` accessible
- [ ] ENV status affiché (sans valeurs)
- [ ] DB status OK
- [ ] Family exists OK
- [ ] Compteurs corrects

### Listes

- [ ] `/staff/recruitments` liste les tickets
- [ ] `/staff/complaints-tickets` liste les tickets
- [ ] Filtrage par status fonctionne

### Détail

- [ ] Page détail affiche toutes les infos
- [ ] Bouton "Ouvrir le thread Discord" fonctionne
- [ ] Bouton "Copier le lien" fonctionne

---

## 6. Monitoring

### Logs

- [ ] Logs worker visibles (JSON structuré)
- [ ] Logs panel visibles (console serveur)

### Healthcheck

- [ ] `GET /api/health` retourne 200
- [ ] Worker vérifie panel health au boot

---

## 7. Post-Déploiement

- [ ] Tester création ticket avec un compte test
- [ ] Tester fermeture ticket
- [ ] Vérifier qu'aucune erreur dans les logs
- [ ] Documenter les IDs des salons
- [ ] Sauvegarder les variables d'environnement
