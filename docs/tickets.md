# Système de Tickets Discord — Documentation

## Vue d'ensemble

Le système de tickets permet aux utilisateurs Discord de créer des demandes de recrutement ou des plaintes, qui sont ensuite traitées par le staff via Discord et le Panel web.

## Flow Ticket

```
1. User clique sur bouton (Recrutement / Plainte)
2. Modal s'ouvre → User remplit les champs
2bis. Recrutement: second modal pour le questionnaire RP complet
3. Submit → Thread créé dans TICKETS_PARENT_CHANNEL
4. Message initial posté avec embed + boutons staff
5. Ingest vers Panel → Ticket créé en DB
6. Discussion dans le thread
7. Staff clique sur bouton fermeture
8. Ingest close → DB mise à jour
9. Thread lock + archive
10. Log envoyé dans TICKETS_LOGS_CHANNEL
```

## Statuts

### Recrutement

| Status | Description |
|--------|-------------|
| `PENDING` | Ticket ouvert, en attente de traitement |
| `ARCHIVED` | Ticket fermé (FIN_RECRUTEMENT) |

### Plainte

| Status | Description |
|--------|-------------|
| `OPEN` | Ticket ouvert |
| `RESOLVED` | Traité avec succès |
| `REJECTED` | Non résolu ou refusé |
| `CLOSED` | Fermé (autre raison) |

### Mapping Discord → DB

| Bouton Discord | Status DB |
|----------------|-----------|
| `FIN_RECRUTEMENT` | `ARCHIVED` |
| `TRAITÉ` | `RESOLVED` |
| `NON_RÉSOLUE` | `REJECTED` |
| `REFUSÉ` | `REJECTED` |

## Anti-Spam

### Rate Limit (Cooldown)

- 30 secondes entre chaque création de ticket par utilisateur
- Message: "Attends encore Xs avant de créer un nouveau ticket"

### Limite Tickets Ouverts

- Configurable via `TICKETS_OPEN_LIMIT` (défaut: 1)
- Un utilisateur ne peut pas avoir plus de X tickets ouverts du même type
- Message: "Tu as déjà X ticket(s) ouvert(s)..."

### Vérification

Le worker appelle:
```
GET /api/ingest/tickets/open?type=recruitment&discordId=USER_ID
```

## Traitement par le Staff

### Via Discord

1. Aller dans le thread du ticket
2. Lire l'embed récapitulatif
3. Discuter avec l'utilisateur si nécessaire
4. Cliquer sur le bouton de fermeture approprié:
   - **Recrutement**: `FIN_RECRUTEMENT`
   - **Plainte**: `TRAITÉ` / `NON_RÉSOLUE` / `REFUSÉ`

### Via Panel

1. Aller sur `/staff/recruitments` ou `/staff/complaints-tickets`
2. Cliquer sur le ticket
3. Voir les détails (payload, auteur, dates)
4. Optionnel: modifier le status / ajouter un résumé
5. Cliquer sur "Ouvrir le thread Discord" pour communiquer

## Boutons dans les Threads

### Premier message (embed)

Contient:
- Récapitulatif du ticket (TicketKey, Auteur, Steam ID, etc.)
- Bouton "OUVRIR SUR LE PANEL" (lien vers la page détail)
- Boutons de fermeture staff

### À la fermeture

- Embed "Ticket fermé" avec nom du staff et status
- Thread lock + archive
- Log dans `TICKETS_LOGS_CHANNEL`

## Logs

### Où regarder

1. **Console du worker** — Logs JSON en temps réel
2. **Salon TICKETS_LOGS** — Embeds de fermeture
3. **Panel `/staff/diagnostics`** — Compteurs et status

### Format logs worker

```json
{
  "event": "ticket_create",
  "type": "recruitment",
  "ticketKey": "R-20260120-XXXX",
  "threadId": "1234567890123456789",
  "authorId": "9876543210987654321",
  "ingestOk": true,
  "timestamp": "2026-01-20T12:00:00.000Z"
}
```

### Log de fermeture (embed Discord)

```
🧾 Ticket fermé
Type: recruitment
Ticket: R-20260120-XXXX
Status: FIN_RECRUTEMENT
Staff: Username#0000
Thread: #recrutement-R-20260120-XXXX
Lien Panel: https://panel.example.com/staff/recruitments/R-20260120-XXXX
```

## API Ingest

### Endpoint unique

```
POST /api/ingest/tickets
Header: x-ingest-secret: <SECRET>
```

### Event Types

| Type | Description |
|------|-------------|
| `recruitment.create` | Création ticket recrutement |
| `recruitment.close` | Fermeture ticket recrutement |
| `complaint.create` | Création ticket plainte |
| `complaint.close` | Fermeture ticket plainte |

### Payload exemple

```json
{
  "version": 1,
  "familyId": "esperados",
  "type": "recruitment.create",
  "ticketKey": "R-20260120-XXXX",
  "threadId": "1234567890123456789",
  "author": { "id": "9876543210987654321", "tag": "User#0000" },
  "payload": {
    "steamId": "...",
    "rpName": "...",
    "motivation": "...",
    "dispo": "...",
    "questionnaireRaw": "1. ...\n2. ...\n...\n22. ...",
    "questionsGenerales": ["...", "..."],
    "questionsPieges": ["...", "..."]
  }
}
```

## Dépannage

### Ticket créé mais pas visible sur le Panel

1. Vérifier que l'ingest a réussi (logs worker: `ingestOk: true`)
2. Vérifier que `INGEST_SECRET` correspond
3. Vérifier que la Family existe en DB
4. Aller sur `/staff/diagnostics` pour voir les compteurs

### Boutons ne répondent pas

1. Vérifier que le worker est en cours d'exécution
2. Vérifier les permissions du bot
3. Vérifier les logs pour des erreurs

### Thread non lock à la fermeture

→ Le bot n'a pas la permission `Manage Threads`
