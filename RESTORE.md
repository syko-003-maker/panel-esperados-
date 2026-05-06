# Procédures de restauration — Los Esperados

Ce document décrit comment restaurer le panel Los Esperados en cas d'incident.
À garder à jour à chaque modification de l'infra.

---

## 🗂️ Localisation des backups

| Type       | Chemin                                      | Rétention | Quand        |
|------------|---------------------------------------------|-----------|--------------|
| PostgreSQL | `/home/ubuntu/backups/postgres/*.dump`      | 14 jours  | 03:00 UTC    |
| `.env`     | `/home/ubuntu/backups/env/*.gpg` (chiffré)  | 7 jours   | 03:15 UTC    |
| Logs      | `/home/ubuntu/backups/logs/`                 | rotation auto | continu |

Passphrase GPG : `/home/ubuntu/.panel-backup-passphrase` (mode 600 ubuntu).
**À sauvegarder ailleurs** (password manager / coffre OVH) sinon backups env irrécupérables.

---

## 1️⃣ Restauration PostgreSQL (DB corrompue / rollback)

### A. Lister les dumps disponibles
```bash
/home/ubuntu/backups/scripts/restore-postgres.sh
```

### B. Restaurer un dump
```bash
# Le script fait automatiquement un backup safety juste avant
/home/ubuntu/backups/scripts/restore-postgres.sh \
  /home/ubuntu/backups/postgres/panel_db_2026-05-05.dump \
  --yes-i-am-sure
```

Le script :
1. Crée un dump *safety* dans `/home/ubuntu/backups/postgres/safety/`
2. Lance `pg_restore --clean --if-exists` (drop + recreate les tables)
3. Affiche le résumé pg_restore

### C. Redémarrer les services après restore
```bash
sudo systemctl restart panel-esperados.service
sudo systemctl restart discord-worker.service
sleep 5
curl -s http://127.0.0.1:3000/api/health | jq
```

Le healthcheck doit retourner `ok: true, db: true, worker.alive: true`.

---

## 2️⃣ Restauration `.env` (config corrompue / valeurs perdues)

### A. Lister les backups env
```bash
/home/ubuntu/backups/scripts/restore-env.sh
```

### B. Apercu du contenu sans toucher la prod
```bash
# Affiche le dernier panel.env.prod déchiffré dans /tmp
/home/ubuntu/backups/scripts/restore-env.sh --dry-run

# Ou un fichier précis
/home/ubuntu/backups/scripts/restore-env.sh /home/ubuntu/backups/env/panel.env.prod.2026-05-05.gpg
# → déchiffre vers /tmp/restore-...env, ne modifie pas la prod
```

### C. Appliquer en prod
```bash
# Cible auto-détectée depuis le nom du fichier (panel ou worker)
# Backup safety automatique du fichier actuel
/home/ubuntu/backups/scripts/restore-env.sh \
  /home/ubuntu/backups/env/panel.env.prod.2026-05-05.gpg \
  --apply

# Puis redémarrer le service correspondant
sudo systemctl restart panel-esperados.service
# ou
sudo systemctl restart discord-worker.service
```

---

## 3️⃣ Récupération de la passphrase GPG perdue

**Sans la passphrase, les backups `.env.*.gpg` sont irrécupérables.**
Conséquences : il faut reconfigurer les secrets manuellement (Discord OAuth, INGEST_SECRET, etc.).

Pour réinitialiser et générer une nouvelle passphrase (les anciens backups deviennent inutilisables) :
```bash
sudo rm /home/ubuntu/.panel-backup-passphrase
/home/ubuntu/backups/scripts/backup-env.sh --init
# ↑ affiche la nouvelle passphrase une seule fois — à sauvegarder immédiatement
```

---

## 4️⃣ Perte totale du VPS

Procédure complète pour reconstruire sur un nouveau serveur :

1. Provisionner un VPS Ubuntu équivalent + installer les dépendances :
   - PostgreSQL 17, Node 20+, npm, git, gpg, curl
2. Restorer le code du panel : `git clone git@github.com:<user>/panel-esperados-.git /home/ubuntu/panel`
3. Restorer les `.env` (depuis backup off-site / password manager) :
   - `/home/ubuntu/panel/.env.prod`
   - `/home/ubuntu/panel/discord-worker/.env.prod`
4. Restorer la DB :
   - Créer la DB vide : `createdb panel_db`
   - `pg_restore --clean --if-exists --dbname=postgresql://… /chemin/dump.dump`
5. Build et démarrer :
   ```bash
   cd /home/ubuntu/panel && npm ci && npm run build
   cd /home/ubuntu/panel/discord-worker && npm ci && npm run build
   ```
6. Recopier les unités systemd (à versionner dans le repo si pas encore fait) :
   - `panel-esperados.service`, `discord-worker.service`
   - `panel-backup-postgres.{service,timer}`, `panel-backup-env.{service,timer}`
   - `panel-worker-watchdog.{service,timer}`
7. `sudo systemctl daemon-reload && sudo systemctl enable --now panel-esperados.service discord-worker.service panel-backup-postgres.timer panel-backup-env.timer panel-worker-watchdog.timer`
8. Vérifier : `curl -s http://127.0.0.1:3000/api/health | jq` doit retourner `ok: true`.

---

## 5️⃣ Vérification quotidienne (sans incident)

### Vérifier que les timers tournent
```bash
systemctl list-timers --all | grep panel-
```

Attendu : 3 timers actifs (`panel-backup-postgres.timer`, `panel-backup-env.timer`, `panel-worker-watchdog.timer`) avec `NEXT` dans les 24 prochaines heures.

### Vérifier les derniers backups
```bash
ls -lhrt /home/ubuntu/backups/postgres/ | tail -5
ls -lhrt /home/ubuntu/backups/env/ | tail -5
```

Attendu : un fichier daté de la nuit dernière (UTC).

### Vérifier les logs de backup
```bash
tail -20 /home/ubuntu/backups/logs/backup-postgres.log
tail -20 /home/ubuntu/backups/logs/backup-env.log
```

Attendu : la dernière ligne contient `✓ Backup OK`.

### Vérifier la santé du système
```bash
curl -s http://127.0.0.1:3000/api/health | jq
```

Attendu :
```json
{
  "ok": true,
  "db": true,
  "worker": {
    "alive": true,
    "http": { "alive": true, "status": 200 },
    "heartbeat": { "alive": true, "ageMs": <180000 }
  }
}
```

---

## 6️⃣ Tests manuels d'incident

Pour valider que les alertes fonctionnent :

### Simuler un worker down
```bash
sudo systemctl stop discord-worker.service
sleep 200  # attendre que heartbeat date > 3 min

# Forcer le watchdog à tourner maintenant
sudo systemctl start panel-worker-watchdog.service

# Vérifier que l'alerte a été générée (dans les logs panel)
journalctl -u panel-esperados.service --since "1 minute ago" | grep -i "alert\|watchdog"

# Restorer le worker
sudo systemctl start discord-worker.service
```

### Tester le restore postgres sur DB de staging
À faire 1 fois par mois sur une DB de test (à mettre en place dans une étape ultérieure).

---

## 📞 Contacts en cas d'incident majeur

À compléter avec les contacts internes (admin OVH, devs panel).
